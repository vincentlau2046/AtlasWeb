import { describe, expect, test } from 'bun:test'
import { launchHost, makeSeedDir, rmDir, httpRequest, redeemForCookie, cookieHeaderValue } from './helpers'
import { request } from 'node:http'
import { sseReader } from './e2e-04-follow-convergence.test'
import {
  WebSessionEventSchema,
} from '@atlasharness/atlascode/web-contract'

// E2E-10 浏览器侧契约验证（计划 v1 P2）：所有 HTTP 响应与 SSE 帧过
// web-contract zod schema（浏览器 ESM 产物，zod/v4）客户端解析。
// - 成功响应：WebSessionSuccessSchema（of: listSessions/searchSessions/replaySession 判别）；
// - follow 帧：WebSessionEventSchema（baseline/replacement/error/closed…，closed 恒唯一 terminal）；
// - host 层错误 JSON（{error, code}）为 host 域映射，不属契约 envelope，仅断言形态。
// 注意（F4 @71c2208 注记）：follow 帧 cursor 字段会下发（ledger 发放），
// 仅 resumeCursor 重入消费上游缺席——不影响本文件帧级 schema 验证。

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

describe('E2E-10 web-contract zod validation (browser-side proxy)', () => {
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

  test('live: list/replay/search responses parse; frames parse; closed is sole terminal', async () => {
    // 【缺陷 ⑥-B（扩大定谳）】四面 HTTP 响应均为裸 runtime payload，不符合
    // 发布的 WebSessionSuccessSchema envelope（schema 探针 2026-11-16）：
    // - list/search：连 of 判别字段都没有；
    // - replay：有 of，但缺顶层 schemaVersion/productId/scopeId（requestId 亦缺）。
    // 按总约 §4 envelope 最小语义（schemaVersion/requestId/productId/scopeId），
    // host 应包 envelope（consumer 侧可修）。follow SSE 帧面【符合】契约 ✓。
    // 已报 F4；host envelope 化后本组断言翻转回 WebSessionSuccessSchema.parse。
    const listRes = await httpRequest(host.port, '/sessions?scopeId=main', { headers: { cookie } })
    expect(listRes.status).toBe(200)
    const listBody = JSON.parse(listRes.body) as { of?: string; schemaVersion?: number; sessions: Array<{ sessionId: string; title: string | null; createdAt: string | null; updatedAt: string; messageCount: number | null; productId: string; scopeId: string }> }
    expect(listBody.of).toBeUndefined() // ⑥-B 现形断言（修复后翻转）
    expect(listBody.schemaVersion).toBeUndefined() // ⑥-B 现形断言（修复后翻转）
    expect(listBody.sessions.map(s => s.sessionId)).toContain('sess-1')
    for (const s of listBody.sessions) {
      expect(typeof s.updatedAt).toBe('string')
      expect(s.productId).toBe('atlascode')
      expect(s.scopeId).toBe('main')
    }

    const replayRes = await httpRequest(host.port, '/sessions/sess-1/replay?scopeId=main', { headers: { cookie } })
    expect(replayRes.status).toBe(200)
    const replayBody = JSON.parse(replayRes.body) as { of?: string; schemaVersion?: number; projection?: { semantics: string; messages: Array<{ id: string; role: string; blocks: Array<{ kind: string; text?: string }> }> } }
    expect(replayBody.of).toBe('replaySession') // replay 唯一带 of
    expect(replayBody.schemaVersion).toBeUndefined() // ⑥-B：缺 envelope 字段（修复后翻转）
    expect(replayBody.projection!.semantics).toBe('persisted-effective-conversation')
    expect(replayBody.projection!.messages[0]!.blocks[0]).toEqual({ kind: 'text', text: 'the quick brown fox' })

    const searchRes = await httpRequest(host.port, '/sessions/search?scopeId=main&q=quick%20brown', { headers: { cookie } })
    expect(searchRes.status).toBe(200)
    const searchBody = JSON.parse(searchRes.body) as { of?: string; results: Array<{ sessionId: string; messageId: string; snippet: string }> }
    expect(searchBody.of).toBeUndefined() // ⑥-B 现形断言（修复后翻转）
    expect(searchBody.results[0]!.sessionId).toBe('sess-1')

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

  test('host-domain error JSON shape (non-envelope): {error, code} present on mapped errors', async () => {
    const notFound = await httpRequest(host.port, '/sessions/nope/replay?scopeId=main', { headers: { cookie } })
    expect(notFound.status).toBe(404)
    const body = JSON.parse(notFound.body) as { error?: string; code?: string }
    expect(body.code).toBe('notFound')
    expect(typeof body.error).toBe('string')
    // 契约 envelope 不用于 HTTP 错误响应（host 域映射）——显式断言分离
    expect((body as { of?: string }).of).toBeUndefined()
  })

  test('teardown', async () => {
    const code = await host.stop()
    expect(code).toBe(0)
    rmDir(dir)
  }, 30000)
})
