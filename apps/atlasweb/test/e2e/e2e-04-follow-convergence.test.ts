import { describe, expect, test } from 'bun:test'
import { launchHost, makeSeedDir, rmDir, httpRequest, redeemForCookie, cookieHeaderValue, type SeedLine } from './helpers'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { request } from 'node:http'

// E2E-04 follow 断线收敛（计划 v1 P1，真实进程 + 真实 runtime）：
// SSE（data: {json}\n\n，WebSessionEvent v0）经 GET /sessions/:id/follow。
// 1. baseline（revision 0，schemaVersion 0，semantics persisted-effective-conversation）；
// 2. 文件追加 → replacement（同 baselineId，revision 递增）→ 最终投影与磁盘 replay 一致；
// 3. unknown session → 流内 error{notFound} → closed 对，终态后零数据事件。
// 客户端纪律：node:http 渐进消费（非 bun fetch）。

const HOST = '127.0.0.1'

export interface SseEvent { kind: string; [k: string]: unknown }

/** 流式 SSE 事件读取器：渐进消费 node:http response（背压/断连类用例唯一合法客户端形态） */
export function sseReader(res: import('node:http').IncomingMessage) {
  let buf = ''
  const queue: SseEvent[] = []
  let ended = false
  res.on('data', (d: Buffer) => {
    buf += d.toString()
    for (;;) {
      const i = buf.indexOf('\n\n')
      if (i < 0) break
      const frame = buf.slice(0, i)
      buf = buf.slice(i + 2)
      const dl = frame.split('\n').find(l => l.startsWith('data: '))
      if (dl) queue.push(JSON.parse(dl.slice(6)) as SseEvent)
    }
  })
  res.on('end', () => { ended = true })
  res.on('error', () => { ended = true })
  return {
    /** 下一事件；流结束返回 null；超时抛错 */
    async next(timeoutMs = 5000): Promise<SseEvent | null> {
      const deadline = Date.now() + timeoutMs
      for (;;) {
        if (queue.length > 0) return queue.shift()!
        if (ended) return null
        if (Date.now() > deadline) throw new Error('sse next timeout')
        await new Promise<void>(r => setTimeout(r, 25))
      }
    },
  }
}

function openFollow(port: number, path: string, headers: Record<string, string>): Promise<import('node:http').IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = request({ host: HOST, port, path, headers }, res => resolve(res))
    req.on('error', reject)
    req.end()
  })
}

function seedTwoLines(): SeedLine[] {
  return [
    { type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2026-11-16T08:00:00.000Z', message: { role: 'user', content: 'hi' } },
    { type: 'assistant', uuid: 'a1', parentUuid: 'u1', timestamp: '2026-11-16T08:00:01.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'hello' }] } },
  ]
}

let host: Awaited<ReturnType<typeof launchHost>>
let dir: string
let cookie: string

describe('E2E-04 follow SSE convergence over real process', () => {
  test('setup: launch + redeem', async () => {
    dir = makeSeedDir('atlasweb-e2e04-', { 'sess-1': seedTwoLines() })
    host = await launchHost({ scopes: [{ id: 'main', dir }] })
    cookie = cookieHeaderValue(await redeemForCookie(host.port, host.token))
  }, 30000)

  test('baseline → append → replacement converges with disk (replay ground truth)', async () => {
    const res = await openFollow(host.port, '/sessions/sess-1/follow?scopeId=main', { cookie })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/event-stream')
    const reader = sseReader(res)

    const baseline = await reader.next()
    expect(baseline?.kind).toBe('baseline')
    expect(baseline!.schemaVersion).toBe(0)
    expect(baseline!.revision).toBe(0)
    expect(baseline!.projection.semantics).toBe('persisted-effective-conversation')
    expect(baseline!.projection.messages).toHaveLength(2)
    expect(typeof baseline!.cursor).toBe('string')
    expect(typeof baseline!.baselineId).toBe('string')

    // 追加 → replacement（同 baselineId，revision+1）
    appendFileSync(join(dir, 'sess-1.jsonl'), JSON.stringify({ type: 'user', uuid: 'u2', parentUuid: 'a1', timestamp: '2026-11-16T08:00:05.000Z', message: { role: 'user', content: 'again' } }) + '\n')
    const replacement = await reader.next()
    expect(replacement?.kind).toBe('replacement')
    expect(replacement!.baselineId).toBe(baseline!.baselineId)
    expect(replacement!.revision).toBe(baseline!.revision + 1)
    expect(replacement!.projection.messages).toHaveLength(3)

    // 终态收敛：流内最新投影 = 磁盘 replay 投影
    const rep = await httpRequest(host.port, '/sessions/sess-1/replay?scopeId=main', { headers: { cookie } })
    const diskProjection = (JSON.parse(rep.body) as { projection: { messages: unknown[] } }).projection
    expect(replacement!.projection.messages).toEqual(diskProjection.messages)

    // 订阅保持打开（静态后零事件）；主动断开
    res.destroy()
  }, 30000)

  test('unknown session → in-stream error{notFound} → closed pair, zero data events after terminal', async () => {
    const res = await openFollow(host.port, '/sessions/nope/follow?scopeId=main', { cookie })
    expect(res.statusCode).toBe(200) // 流前不 404：分态在流内（上游契约形）
    const reader = sseReader(res)
    const err = await reader.next()
    expect(err?.kind).toBe('error')
    expect((err as { error?: { code?: string } }).error?.code).toBe('notFound')
    const closed = await reader.next()
    expect(closed?.kind).toBe('closed')
    const after = await reader.next()
    expect(after).toBeNull() // 终态后零数据事件、流收敛
  }, 30000)

  test('no cookie on follow → 401 pre-stream', async () => {
    const res = await httpRequest(host.port, '/sessions/sess-1/follow?scopeId=main')
    expect(res.status).toBe(401)
  })

  test('SIGTERM with open follow stream → bounded graceful exit 0（F4 @71c2208 挂死修复回归腿）', async () => {
    // 原缺陷形：server.close() 永等 SSE 连接 → SIGTERM 挂死（SIGKILL 才能终止，
    // 探针 2026-11-16 定谳）。修复形：shutdown 先 sessionHost.close() 终止
    // 活跃订阅 → 泵终流 + closeAllConnections 兜底。
    const dir2 = makeSeedDir('atlasweb-e2e04b-', { 'sess-1': seedTwoLines() })
    try {
      const host2 = await launchHost({ scopes: [{ id: 'main', dir: dir2 }] })
      const cookie2 = cookieHeaderValue(await redeemForCookie(host2.port, host2.token))
      const res = await openFollow(host2.port, '/sessions/sess-1/follow?scopeId=main', { cookie: cookie2 })
      expect(res.statusCode).toBe(200)
      const reader = sseReader(res)
      expect((await reader.next())?.kind).toBe('baseline')
      // 流保持打开时 SIGTERM：必须 3s 内优雅退出 0（挂死形 = stop() 走
      // SIGKILL 兜底 → code null）
      const t0 = Date.now()
      const code = await host2.stop()
      expect(code).toBe(0)
      expect(Date.now() - t0).toBeLessThan(3000)
      void reader
    } finally {
      rmDir(dir2)
    }
  }, 30000)

  test('teardown', async () => {
    const code = await host.stop()
    expect(code).toBe(0)
    rmDir(dir)
  }, 30000)
})
