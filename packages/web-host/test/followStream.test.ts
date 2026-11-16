import { describe, expect, test } from 'bun:test'

// G2 格 D+H follow 流（SSE 桥）判据：
// 1. GET /sessions/:id/follow = text/event-stream；首个事件 kind='baseline'
//    （先采样后 baseline 一致快照）；
// 2. 文件追加 → 'replacement' 事件到达（最终收敛，非 per-token 非
//    exactly-once，S0 协定 §2 语义）；
// 3. 客户端断开 → 订阅释放、流终止；unknown session → 404（流前分态）；
//    无 cookie → 401（auth 先于路由）。
// 协议事实源 = 上游 WebSessionEventSchema（v0）：baseline/replacement/
// resetRequired/error/closed，closed 恒唯一 terminal。
import { appendFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const HOST = '127.0.0.1'
const PORT = 8919

interface SseEvent { kind: string; [k: string]: unknown }

async function readSseEvent(reader: ReadableStreamDefaultReader<Uint8Array>, buf: { text: string }): Promise<SseEvent> {
  for (;;) {
    const idx = buf.text.indexOf('\n\n')
    if (idx >= 0) {
      const frame = buf.text.slice(0, idx)
      buf.text = buf.text.slice(idx + 2)
      const dataLine = frame.split('\n').find(l => l.startsWith('data: '))
      return JSON.parse(dataLine!.slice(6)) as SseEvent
    }
    const { value, done } = await reader.read()
    if (done) throw new Error('stream ended before event')
    buf.text += new TextDecoder().decode(value)
  }
}

async function startServer() {
  const { createHttpHost } = await import('../src/httpHost')
  const { createSessionHost } = await import('../src/sessionHost')
  const { createLaunchAuth } = await import('../src/auth')
  const dir = mkdtempSync(join(tmpdir(), 'atlasweb-follow-'))
  const transcript = join(dir, 'sess-1.jsonl')
  writeFileSync(transcript, [
    JSON.stringify({ type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2026-11-16T08:00:00.000Z', message: { role: 'user', content: 'hi' } }),
  ].join('\n') + '\n')
  const sessionHost = createSessionHost({ productId: 'atlascode', scopes: [{ scopeId: 'main', storageDir: dir }] })
  const auth = createLaunchAuth({ secret: 'follow-test-secret-32-bytes!!!!!!' })
  const server = createHttpHost({ sessionHost, auth })
  await new Promise<void>(resolve => server.listen(PORT, HOST, resolve))
  await sessionHost.start()
  const cookie = auth.redeemLaunchToken(auth.issueLaunchToken())!
  return {
    base: `http://${HOST}:${PORT}`, cookie, dir, transcript,
    async stop() {
      await new Promise<void>(resolve => server.close(() => resolve()))
      await sessionHost.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

describe('httpHost follow stream (SSE bridge)', () => {
  test('baseline → append → replacement → client abort releases stream; 404/401 pre-stream', async () => {
    const ctx = await startServer()
    try {
      const headers = { host: `${HOST}:${PORT}`, cookie: `atlas_session=${ctx.cookie}` }
      // 无 cookie → 401（先于路由）
      const noAuth = await fetch(`${ctx.base}/sessions/sess-1/follow?scopeId=main`, { headers: { host: headers.host } })
      expect(noAuth.status).toBe(401)
      // unknown session → 上游契约形：流内 error{notFound} → closed 对，
      // 随后流终（fail-closed 事件语义；404 预流映射仅属请求/响应面 replay）
      const missing = await fetch(`${ctx.base}/sessions/nope/follow?scopeId=main`, { headers })
      expect(missing.status).toBe(200)
      expect(missing.headers.get('content-type')).toContain('text/event-stream')
      const mReader = missing.body!.getReader() as ReadableStreamDefaultReader<Uint8Array>
      const mBuf = { text: '' }
      const mErr = await readSseEvent(mReader, mBuf)
      expect(mErr.kind).toBe('error')
      expect((mErr as { error?: { code?: string } }).error?.code).toBe('notFound')
      const mClosed = await readSseEvent(mReader, mBuf)
      expect(mClosed.kind).toBe('closed')
      const mDone = await mReader.read()
      expect(mDone.done).toBe(true) // 终态后零数据事件、流收敛

      const ac = new AbortController()
      const res = await fetch(`${ctx.base}/sessions/sess-1/follow?scopeId=main`, { headers, signal: ac.signal })
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('text/event-stream')
      const reader = res.body!.getReader() as ReadableStreamDefaultReader<Uint8Array>
      const buf = { text: '' }
      const first = await readSseEvent(reader, buf)
      expect(first.kind).toBe('baseline')
      // 追加一条记录 → replacement 到达（最终收敛语义）
      appendFileSync(ctx.transcript, JSON.stringify({ type: 'user', uuid: 'u2', parentUuid: 'u1', timestamp: '2026-11-16T08:00:05.000Z', message: { role: 'user', content: 'again' } }) + '\n')
      let sawReplacement = false
      for (let i = 0; i < 2 && !sawReplacement; i++) {
        const ev = await Promise.race([
          readSseEvent(reader, buf),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout waiting replacement')), 5000)),
        ])
        if (ev.kind === 'replacement') sawReplacement = true
      }
      expect(sawReplacement).toBe(true)
      // 客户端断开 → 订阅释放、流终止
      ac.abort()
      // 断开后短暂等待，服务端应清理（无未处理 rejection / 崩溃）；
      // 连接资源归零由订阅槽释放机制承载。
      await new Promise(r => setTimeout(r, 200))
    } finally {
      await ctx.stop()
    }
  })
})

// 安全审查双腿（commit security review 2026-11-16）：
// 腿a 订阅槽泄漏：静态会话（零新事件）+ 客户端断开 → 槽必须立即释放
//   （maxSubscriptions=1 下第二次 follow 须成功；断开不得等下一事件才清理）；
// 腿b 背压：慢消费者 res.write()=false 时宿主须停止拉取订阅事件
//   （HTTP 缓冲不得绕过上游有界队列），drain 后恢复拉取。
describe('follow stream backpressure + slot release', () => {
  test('腿a client disconnect frees subscription slot promptly on a static session', async () => {
    const { createHttpHost } = await import('../src/httpHost')
    const { createSessionHost } = await import('../src/sessionHost')
    const { createLaunchAuth } = await import('../src/auth')
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const PORT2 = 8921
    const dir = mkdtempSync(join(tmpdir(), 'atlasweb-slot-'))
    try {
      writeFileSync(join(dir, 'static.jsonl'), [
        JSON.stringify({ type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2026-11-16T08:00:00.000Z', message: { role: 'user', content: 'hi' } }),
      ].join('\n') + '\n')
      const sessionHost = createSessionHost({
        productId: 'atlascode',
        scopes: [{ scopeId: 'main', storageDir: dir }],
        limits: { maxSubscriptions: 1 }, // 单槽：泄漏立即可观测
      })
      const auth = createLaunchAuth({ secret: 'slot-test-secret-32-bytes!!!!!!!!' })
      const server = createHttpHost({ sessionHost, auth })
      await new Promise<void>(resolve => server.listen(PORT2, HOST, resolve))
      await sessionHost.start()
      try {
        const headers = { host: `${HOST}:${PORT2}`, cookie: `atlas_session=${auth.redeemLaunchToken(auth.issueLaunchToken())!}` }
        const ac = new AbortController()
        const res1 = await fetch(`http://${HOST}:${PORT2}/sessions/static/follow?scopeId=main`, { headers, signal: ac.signal })
        expect(res1.status).toBe(200)
        const reader1 = res1.body!.getReader() as ReadableStreamDefaultReader<Uint8Array>
        const buf1 = { text: '' }
        expect((await readSseEvent(reader1, buf1)).kind).toBe('baseline')
        // 客户端断开；静态会话永不再产事件 → 清理不得依赖下一事件
        ac.abort()
        await new Promise(r => setTimeout(r, 300))
        // 第二次 follow 须成功（槽已释放）；泄漏形 = resourceLimit(429)
        const res2 = await fetch(`http://${HOST}:${PORT2}/sessions/static/follow?scopeId=main`, { headers })
        expect(res2.status).toBe(200)
        await res2.body!.cancel()
      } finally {
        await new Promise<void>(resolve => server.close(() => resolve()))
        await sessionHost.close()
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('腿b non-reading client is force-disconnected after slowConsumerMs deadline', async () => {
    // 传输级慢消费者判据（安全审查② follow-up）：裸 TCP 客户端连接后永不读
    // → 真背压（write=false、drain 恒不至）→ slowConsumerMs 超限 → 服务端
    // 必须 destroy 强断（优雅 end 会先冲缓冲，零窗口下连接无限挂住）。
    // 裸 socket 绕开 bun fetch 急切缓冲（探针 2026-11-16），可造真零窗口。
    const { createHttpHost } = await import('../src/httpHost')
    const { createSessionHost } = await import('../src/sessionHost')
    const { createLaunchAuth } = await import('../src/auth')
    const { createServer: createTcp } = await import('node:net')
    const PORT3 = 8925
    const BIG = 'x'.repeat(512 * 1024)
    const fakeRuntime = {
      epoch: 'fake-epoch',
      limits: { maxSubscriptions: 8 },
      start: async () => {},
      close: async () => {},
      listSessions: async () => ({ sessions: [] }),
      replaySession: async () => { throw new Error('not used') },
      followSession: async () => {
        let i = 0
        return {
          [Symbol.asyncIterator]() {
            return {
              next: async () => {
                i++
                return { done: false as const, value: { kind: i === 1 ? 'baseline' : 'replacement', projection: { semantics: 'persisted-effective-conversation', messages: [{ id: `m${i}`, text: BIG }] }, schemaVersion: 0, productId: 'atlascode', scopeId: 'main', sessionId: 's', subscriptionId: 'sub1' } }
              },
            }
          },
          renewLease: async () => true,
          close: async () => {},
        }
      },
    }
    const sessionHost = createSessionHost({
      productId: 'atlascode',
      scopes: [{ scopeId: 'main', storageDir: '/tmp' }],
      runtimeOverride: fakeRuntime as never,
    })
    const auth = createLaunchAuth({ secret: 'slow-consumer-secret-32-bytes!!!!!!!' })
    const server = createHttpHost({ sessionHost, auth, followSlowConsumerMs: 300 })
    await new Promise<void>(resolve => server.listen(PORT3, HOST, resolve))
    await sessionHost.start()
    try {
      const cookie = auth.redeemLaunchToken(auth.issueLaunchToken())!
      // 检测形（TCP 语义，探针 2026-11-16 双运行时定谳）：客户端保持零读
      //（真零窗口）——RST 对零读对端事件级不可观测（close/end/error 均不
      // 显形）；可移植判别面 = 服务端连接数：destroy → 归零；优雅 end 零
      // 窗口下永远完不成 flush → 连接恒挂（资源占用 = RED 形）。
      const sock = createTcp({ host: HOST, port: PORT3 }, () => {
        sock.write(`GET /sessions/s/follow?scopeId=main HTTP/1.1\r\nhost: ${HOST}:${PORT3}\r\ncookie: atlas_session=${cookie}\r\n\r\n`)
      })
      sock.on('error', () => {})
      const disconnected = await (async (): Promise<boolean> => {
        for (let t = 0; t <= 4000; t += 250) {
          const conns = await new Promise<number>(resolve => server.getConnections((_, c) => resolve(c)))
          if (conns === 0) return true
          await new Promise(r => setTimeout(r, 250))
        }
        return false
      })()
      expect(disconnected).toBe(true) // 超限后服务端连接归零（强断，非优雅挂住）
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
      await sessionHost.close()
    }
  })
})
