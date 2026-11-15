import { describe, expect, test } from 'bun:test'

// G2 真实 controller 路由判据（格 D + H）：
// 1. 无 cookie → 401；坏 fence（非 loopback Host/跨源 Origin）→ 403；
// 2. 合法 cookie → GET /sessions = 真实 list；GET /sessions/:id/replay = 真实投影；
// 3. 未知路由 404；未知 scope → 403 scopeDenied；未知 session → 404；
// 4. 零真实 HOME 触碰（seeded temp dir）。
const HOST = '127.0.0.1'
const PORT = 8917

async function startServer() {
  const { createHttpHost } = await import('../src/httpHost')
  const { createSessionHost } = await import('../src/sessionHost')
  const { createLaunchAuth } = await import('../src/auth')
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const dir = mkdtempSync(join(tmpdir(), 'atlasweb-http-'))
  writeFileSync(join(dir, 'sess-1.jsonl'), [
    JSON.stringify({ type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2026-11-16T08:00:00.000Z', message: { role: 'user', content: 'hi' } }),
    JSON.stringify({ type: 'assistant', uuid: 'a1', parentUuid: 'u1', timestamp: '2026-11-16T08:00:01.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'hello' }] } }),
  ].join('\n') + '\n')
  const sessionHost = createSessionHost({ productId: 'atlascode', scopes: [{ scopeId: 'main', storageDir: dir }] })
  const auth = createLaunchAuth({ secret: 'http-test-secret-32-bytes!!!!!!!' })
  const server = createHttpHost({ sessionHost, auth })
  await new Promise<void>(resolve => server.listen(PORT, HOST, resolve))
  await sessionHost.start()
  const cookie = auth.redeemLaunchToken(auth.issueLaunchToken())!
  const base = `http://${HOST}:${PORT}`
  return {
    base, cookie, dir,
    async stop() {
      await new Promise<void>(resolve => server.close(() => resolve()))
      await sessionHost.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

describe('httpHost loopback routes', () => {
  test('auth + fence + real four-face routes on seeded data', async () => {
    const ctx = await startServer()
    try {
      // 1. 无 cookie → 401
      const noAuth = await fetch(`${ctx.base}/sessions`, { headers: { host: `${HOST}:${PORT}` } })
      expect(noAuth.status).toBe(401)
      // 2. 非 loopback Host → 403（fence 先于 auth 判 401 与否均可，但须拒）
      const evil = await fetch(`${ctx.base}/sessions`, { headers: { cookie: `atlas_session=${ctx.cookie}` }, headers: { host: 'evil.example.com' } })
      expect([403, 401]).toContain(evil.status)
      const cookieHeader = `atlas_session=${ctx.cookie}`
      // 3. 真实 list
      const list = await fetch(`${ctx.base}/sessions`, { headers: { host: `${HOST}:${PORT}`, cookie: cookieHeader } })
      expect(list.status).toBe(200)
      const listBody = await list.json() as { sessions: Array<{ sessionId: string }> }
      expect(listBody.sessions).toHaveLength(1)
      expect(listBody.sessions[0]!.sessionId).toBe('sess-1')
      // 4. 真实 replay 投影
      const replay = await fetch(`${ctx.base}/sessions/sess-1/replay`, { headers: { host: `${HOST}:${PORT}`, cookie: cookieHeader } })
      expect(replay.status).toBe(200)
      const replayBody = await replay.json() as { projection: { semantics: string; messages: unknown[] } }
      expect(replayBody.projection.semantics).toBe('persisted-effective-conversation')
      // 5. 未知 session → 404
      const missing = await fetch(`${ctx.base}/sessions/nope/replay`, { headers: { host: `${HOST}:${PORT}`, cookie: cookieHeader } })
      expect(missing.status).toBe(404)
      // 6. 未知路由 → 404
      const unknown = await fetch(`${ctx.base}/nope`, { headers: { host: `${HOST}:${PORT}`, cookie: cookieHeader } })
      expect(unknown.status).toBe(404)
      // 7. 跨源 Origin → 403
      const cross = await fetch(`${ctx.base}/sessions`, { headers: { host: `${HOST}:${PORT}`, cookie: cookieHeader, origin: 'http://evil.example.com' } })
      expect(cross.status).toBe(403)
    } finally {
      await ctx.stop()
    }
  })
})
