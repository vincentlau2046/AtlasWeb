import { describe, expect, test } from 'bun:test'
import { launchHost, makeSeedDir, rmDir, httpRequest, redeemForCookie, cookieHeaderValue } from './helpers'
import { request } from 'node:http'
import { sseReader } from './e2e-04-follow-convergence.test'
import {
  ListSessionsSuccessSchema,
  SearchSessionsSuccessSchema,
  ReplaySessionSuccessSchema,
  WebSessionErrorResponseSchema,
  WebSessionEventSchema,
} from '@atlaswork/atlascode/web-contract'

// E2E-10 浏览器侧契约验证（计划 v1 P2）：所有 HTTP 响应与 SSE 帧过
// web-contract zod schema（浏览器 ESM 产物，zod/v4）客户端解析。
// 【⑥-B 已修 @b0b435b——严格 parse 全绿】：
// - 成功形 {of, schemaVersion:0, requestId:UUID, productId, scopeId, kind:'response', ...payload}
//   → ListSessions/SearchSessions/ReplaySessionSuccessSchema strict parse；
// - 错误形（契约可映射码 403/404/400/429）→ WebSessionErrorResponseSchema
//   （嵌套 error.code）；500 internal 保持裸形（非契约码，host 故障面）；
// - follow 帧：WebSessionEventSchema（closed 恒唯一 terminal；帧面上游单源
//   本就契约真）。cursor 字段 ledger 发放，仅 resumeCursor 重入消费上游缺席。
// 【余留翻转面】⑥-A grow-rewrite + cursor resume 语义（0.1.121 候）。

const HOST = '127.0.0.1'

function openFollow(port: number, headers: Record<string, string>): Promise<import('node:http').IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = request({ host: HOST, port, path: '/sessions/sess-1/follow?scopeId=main', headers }, res => resolve(res))
    req.on('error', reject)
    req.end()
  })
}

let host: Awaited<ReturnType<typeof launchHost>>
let dir: string
let cookie: string

describe('E2E-10 web-contract zod validation (browser-side proxy, strict)', () => {
  test('setup: launch + redeem', async () => {
    dir = makeSeedDir('atlasweb-e2e10-', {
      'sess-1': [
        { type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2026-11-16T08:00:00.000Z', message: { role: 'user', content: 'the quick brown fox' } },
        { type: 'assistant', uuid: 'a1', parentUuid: 'u1', timestamp: '2026-11-16T08:00:01.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'jumps over the lazy dog' }] } },
      ],
    })
    host = await launchHost({ scopes: [{ id: 'main', dir }] })
    cookie = cookieHeaderValue(await redeemForCookie(host.port, host.token))
  }, 30000)

  test('live: list/replay/search strict-parse success envelopes; frames parse; closed is sole terminal', async () => {
    const listRes = await httpRequest(host.port, '/sessions?scopeId=main', { headers: { cookie } })
    expect(listRes.status).toBe(200)
    const listParsed = ListSessionsSuccessSchema.parse(JSON.parse(listRes.body))
    expect(listParsed.of).toBe('listSessions')
    expect(listParsed.kind).toBe('response')
    expect(listParsed.schemaVersion).toBe(0)
    expect(listParsed.sessions.map(s => s.sessionId)).toContain('sess-1')

    const replayRes = await httpRequest(host.port, '/sessions/sess-1/replay?scopeId=main', { headers: { cookie } })
    expect(replayRes.status).toBe(200)
    const replayParsed = ReplaySessionSuccessSchema.parse(JSON.parse(replayRes.body))
    expect(replayParsed.of).toBe('replaySession')
    expect(replayParsed.projection.semantics).toBe('persisted-effective-conversation')
    expect(replayParsed.projection.messages[0]!.blocks[0]).toEqual({ kind: 'text', text: 'the quick brown fox' })

    const searchRes = await httpRequest(host.port, '/sessions/search?scopeId=main&q=quick%20brown', { headers: { cookie } })
    expect(searchRes.status).toBe(200)
    const searchParsed = SearchSessionsSuccessSchema.parse(JSON.parse(searchRes.body))
    expect(searchParsed.of).toBe('searchSessions')
    expect(searchParsed.results[0]!.sessionId).toBe('sess-1')

    // follow 帧：baseline → (追加) → replacement 全过 schema
    const res = await openFollow(host.port, { cookie })
    const reader = sseReader(res)
    const baseline = WebSessionEventSchema.parse(await reader.next())
    expect(baseline.kind).toBe('baseline')
    expect(baseline.schemaVersion).toBe(0)
    expect(baseline.cursor.length).toBeGreaterThan(0) // ledger 发放（重入消费上游缺席，@71c2208）

    const { appendFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    appendFileSync(join(dir, 'sess-1.jsonl'), JSON.stringify({ type: 'user', uuid: 'u2', parentUuid: 'a1', timestamp: '2026-11-16T08:00:05.000Z', message: { role: 'user', content: 'again' } }) + '\n')
    const replacement = WebSessionEventSchema.parse(await reader.next())
    expect(replacement.kind).toBe('replacement')

    // 主动断开 → 服务端订阅释放；流不出现 closed（客户端先走）——直接销毁
    res.destroy()

    // in-stream 错误帧过 schema：unknown session → error{notFound} → closed 对
    const missing = await new Promise<import('node:http').IncomingMessage>((resolve, reject) => {
      const req = request({ host: HOST, port: host.port, path: '/sessions/nope/follow?scopeId=main', headers: { cookie } }, r => resolve(r))
      req.on('error', reject)
      req.end()
    })
    const mReader = sseReader(missing)
    const errFrame = WebSessionEventSchema.parse(await mReader.next())
    expect(errFrame.kind).toBe('error')
    if (errFrame.kind === 'error') expect(errFrame.error.code).toBe('notFound')
    const closedFrame = WebSessionEventSchema.parse(await mReader.next())
    expect(closedFrame.kind).toBe('closed')
    expect(await mReader.next()).toBeNull()
  }, 30000)

  test('mapped errors parse as WebSessionErrorResponseSchema (nested error.code)', async () => {
    const notFound = await httpRequest(host.port, '/sessions/nope/replay?scopeId=main', { headers: { cookie } })
    expect(notFound.status).toBe(404)
    const parsed = WebSessionErrorResponseSchema.parse(JSON.parse(notFound.body))
    expect(parsed.kind).toBe('error')
    expect(parsed.error.code).toBe('notFound')

    const denied = await httpRequest(host.port, '/sessions?scopeId=other', { headers: { cookie } })
    expect(denied.status).toBe(403)
    expect(WebSessionErrorResponseSchema.parse(JSON.parse(denied.body)).error.code).toBe('scopeDenied')

    const invalid = await httpRequest(host.port, '/sessions/search?scopeId=main&q=', { headers: { cookie } })
    expect(invalid.status).toBe(400)
    expect(WebSessionErrorResponseSchema.parse(JSON.parse(invalid.body)).error.code).toBe('invalidRequest')
  })

  test('teardown', async () => {
    const code = await host.stop()
    expect(code).toBe(0)
    rmDir(dir)
  }, 30000)
})
