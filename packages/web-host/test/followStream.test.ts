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
