import { describe, expect, test } from 'bun:test'

// 格 D searchSessions 消费腿（上游 S0-R4 @0.1.119，件 A 取消语义 A 形）：
// 1. GET /sessions/search?q= → 真实投影搜索：sessionId/messageId/snippet
//    （≤512 码点，命中起点切片）；
// 2. SessionHost.searchSessions 委派（closed/not-started 守卫同形）；
// 3. query 界（1-256 码点）= 契约面——越界 → 400 invalidRequest（fail-closed，
//    runtime 信任上层已验）；
// 4. 未授权 scope → 403 scopeDenied；无 cookie → 401。
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const HOST = '127.0.0.1'
const PORT = 8931

async function startServer() {
  const { createHttpHost } = await import('../src/httpHost')
  const { createSessionHost } = await import('../src/sessionHost')
  const { createLaunchAuth } = await import('../src/auth')
  const dir = mkdtempSync(join(tmpdir(), 'atlasweb-search-'))
  writeFileSync(join(dir, 'alpha.jsonl'), [
    JSON.stringify({ type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2026-11-16T08:00:00.000Z', message: { role: 'user', content: 'the quick brown fox' } }),
    JSON.stringify({ type: 'assistant', uuid: 'a1', parentUuid: 'u1', timestamp: '2026-11-16T08:00:01.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'jumps over the lazy dog' }] } }),
  ].join('\n') + '\n')
  writeFileSync(join(dir, 'beta.jsonl'), [
    JSON.stringify({ type: 'user', uuid: 'u2', parentUuid: null, timestamp: '2026-11-16T09:00:00.000Z', message: { role: 'user', content: 'unrelated content here' } }),
  ].join('\n') + '\n')
  const sessionHost = createSessionHost({ productId: 'atlascode', scopes: [{ scopeId: 'main', storageDir: dir }] })
  const auth = createLaunchAuth({ secret: 'search-test-secret-32-bytes!!!!!!!' })
  const server = createHttpHost({ sessionHost, auth })
  await new Promise<void>(resolve => server.listen(PORT, HOST, resolve))
  await sessionHost.start()
  const cookie = auth.redeemLaunchToken(auth.issueLaunchToken())!
  return {
    base: `http://${HOST}:${PORT}`, cookie, sessionHost,
    async stop() {
      await new Promise<void>(resolve => server.close(() => resolve()))
      await sessionHost.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

describe('格 D searchSessions face (S0-R4 @0.1.119)', () => {
  test('search route returns real projection hits; query bounds fail-closed; auth/scope guards', async () => {
    const ctx = await startServer()
    try {
      const headers = { host: `${HOST}:${PORT}`, cookie: `atlas_session=${ctx.cookie}` }
      // 无 cookie → 401
      const noAuth = await fetch(`${ctx.base}/sessions/search?q=fox`, { headers: { host: headers.host } })
      expect(noAuth.status).toBe(401)
      // 真实搜索：命中 alpha（投影内 'quick brown fox'）
      const hit = await fetch(`${ctx.base}/sessions/search?q=${encodeURIComponent('quick brown')}`, { headers })
      expect(hit.status).toBe(200)
      const body = await hit.json() as { results: Array<{ sessionId: string; messageId: string; snippet: string }> }
      expect(body.results.length).toBeGreaterThan(0)
      expect(body.results[0]!.sessionId).toBe('alpha')
      expect(body.results[0]!.snippet.toLowerCase()).toContain('quick brown')
      expect(body.results[0]!.snippet.length).toBeLessThanOrEqual(512)
      // 零命中 ≠ 伪空错误：unrelated 查询命中 beta 而非误配
      const miss = await fetch(`${ctx.base}/sessions/search?q=${encodeURIComponent('unrelated content')}`, { headers })
      expect(miss.status).toBe(200)
      const missBody = await miss.json() as { results: Array<{ sessionId: string }> }
      expect(missBody.results[0]!.sessionId).toBe('beta')
      // query 界 fail-closed：空 query / >256 码点 → 400 invalidRequest
      const empty = await fetch(`${ctx.base}/sessions/search?q=`, { headers })
      expect(empty.status).toBe(400)
      expect((await empty.json() as { code?: string }).code).toBe('invalidRequest')
      const tooLong = await fetch(`${ctx.base}/sessions/search?q=${encodeURIComponent('x'.repeat(257))}`, { headers })
      expect(tooLong.status).toBe(400)
      // 未授权 scope → 403 scopeDenied
      const denied = await fetch(`${ctx.base}/sessions/search?q=fox&scopeId=other`, { headers })
      expect(denied.status).toBe(403)
    } finally {
      await ctx.stop()
    }
  })

  test('SessionHost.searchSessions delegate: closed/not-started guards', async () => {
    const { createSessionHost } = await import('../src/sessionHost')
    const dir = mkdtempSync(join(tmpdir(), 'atlasweb-searchd-'))
    try {
      const host = createSessionHost({ productId: 'atlascode', scopes: [{ scopeId: 's', storageDir: dir }] })
      // not started → 拒
      await expect(host.searchSessions({ scopeId: 's', query: 'x' })).rejects.toThrow('not started')
      await host.start()
      try {
        const r = await host.searchSessions({ scopeId: 's', query: 'x' })
        expect(Array.isArray(r.results)).toBe(true)
      } finally {
        await host.close()
      }
      await expect(host.searchSessions({ scopeId: 's', query: 'x' })).rejects.toThrow('closed')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
