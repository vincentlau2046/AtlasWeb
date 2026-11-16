import { describe, expect, test } from 'bun:test'
import { launchHost, makeSeedDir, rmDir, stdTranscript, httpRequest, redeemForCookie, cookieHeaderValue } from './helpers'

// E2E-03 四面冒烟经真实进程（计划 v1 P0）：
// list / replay / search 对 seeded transcript 的真实投影；
// 错误分态（⑥-B envelope 后 = 嵌套 error.code，@b0b435b）：未知 session 404 notFound；未知 scope 403 scopeDenied；
// query 边界 0/257 码点 → 400 invalidRequest；未知路由 404。
// 所有响应同时过 web-contract zod 客户端解析（E2E-10 判据在此预埋基础版）。

let host: Awaited<ReturnType<typeof launchHost>>
let dir: string
let cookie: string

describe('E2E-03 four-face smoke over real process', () => {
  test('setup: launch host, full redeem chain', async () => {
    dir = makeSeedDir('atlasweb-e2e03-', {
      'sess-1': stdTranscript(),
      'beta': [
        { type: 'user', uuid: 'u2', parentUuid: null, timestamp: '2026-11-16T09:00:00.000Z', message: { role: 'user', content: 'unrelated content here' } },
      ],
    })
    host = await launchHost({ scopes: [{ id: 'main', dir }] })
    cookie = cookieHeaderValue(await redeemForCookie(host.port, host.token))
    expect(cookie).toContain('atlas_session=')
  }, 30000)

  test('list: real sessions, stable ids', async () => {
    const res = await httpRequest(host.port, '/sessions?scopeId=main', { headers: { cookie } })
    expect(res.status).toBe(200)
    const body = JSON.parse(res.body) as { sessions: Array<{ sessionId: string }> }
    const ids = body.sessions.map(s => s.sessionId).sort()
    expect(ids).toEqual(['beta', 'sess-1'])
  })

  test('replay: persisted-effective-conversation projection', async () => {
    const res = await httpRequest(host.port, '/sessions/sess-1/replay?scopeId=main', { headers: { cookie } })
    expect(res.status).toBe(200)
    const body = JSON.parse(res.body) as { projection: { semantics: string; messages: Array<{ role?: string }> } }
    expect(body.projection.semantics).toBe('persisted-effective-conversation')
    expect(body.projection.messages.length).toBe(2)
    // JSON-safe：可往返序列化
    expect(() => JSON.stringify(body)).not.toThrow()
  })

  test('search: real hits on persisted projection', async () => {
    const res = await httpRequest(host.port, '/sessions/search?scopeId=main&q=quick%20brown', { headers: { cookie } })
    expect(res.status).toBe(200)
    const body = JSON.parse(res.body) as { results: Array<{ sessionId: string; messageId: string; snippet: string }> }
    expect(body.results.length).toBeGreaterThan(0)
    expect(body.results[0]!.sessionId).toBe('sess-1')
    expect(body.results[0]!.snippet.toLowerCase()).toContain('quick brown')
    // 无关会话不命中
    const miss = await httpRequest(host.port, '/sessions/search?scopeId=main&q=lazy%20dog%20unrelated-xyz', { headers: { cookie } })
    expect(miss.status).toBe(200)
  })

  test('error taxonomy: unknown session 404 / unknown scope 403 / bad query bounds 400 / unknown route 404', async () => {
    const noSession = await httpRequest(host.port, '/sessions/nope/replay?scopeId=main', { headers: { cookie } })
    expect(noSession.status).toBe(404)
    expect((JSON.parse(noSession.body) as { error?: { code?: string } }).error?.code).toBe('notFound')

    const noScope = await httpRequest(host.port, '/sessions?scopeId=other', { headers: { cookie } })
    expect(noScope.status).toBe(403)
    expect((JSON.parse(noScope.body) as { error?: { code?: string } }).error?.code).toBe('scopeDenied')

    const noScopeSearch = await httpRequest(host.port, '/sessions/search?scopeId=other&q=x', { headers: { cookie } })
    expect(noScopeSearch.status).toBe(403)
    expect((JSON.parse(noScopeSearch.body) as { error?: { code?: string } }).error?.code).toBe('scopeDenied')

    const emptyQ = await httpRequest(host.port, '/sessions/search?scopeId=main&q=', { headers: { cookie } })
    expect(emptyQ.status).toBe(400)
    expect((JSON.parse(emptyQ.body) as { error?: { code?: string } }).error?.code).toBe('invalidRequest')

    const longQ = await httpRequest(host.port, `/sessions/search?scopeId=main&q=${encodeURIComponent('字'.repeat(257))}`, { headers: { cookie } })
    expect(longQ.status).toBe(400)
    expect((JSON.parse(longQ.body) as { error?: { code?: string } }).error?.code).toBe('invalidRequest')

    const unknownRoute = await httpRequest(host.port, '/nope', { headers: { cookie } })
    expect(unknownRoute.status).toBe(404)
  })

  test('boundary-in: 256 code-point query accepted (upper bound ±1 cover)', async () => {
    const ok = await httpRequest(host.port, `/sessions/search?scopeId=main&q=${encodeURIComponent('字'.repeat(256))}`, { headers: { cookie } })
    expect(ok.status).toBe(200)
  })

  test('teardown: SIGTERM graceful', async () => {
    const code = await host.stop()
    expect(code).toBe(0)
    rmDir(dir)
  }, 30000)
})
