import { describe, expect, test } from 'bun:test'

// 引导兑换路由 GET /auth/redeem?token=（E2E 鉴权全链 seam，裁定 ②）：
// 1. fence 先于兑换（非 loopback Host → 403，引导路由不豁免围栏）；
// 2. 合法 token → 200 + Set-Cookie（HttpOnly/SameSite=Strict/Path=/），
//    该 cookie 直连 /sessions 200（完整 token→cookie→四链路）；
// 3. token 单次性：同 token 二次兑换 → 401（重放必败）；
// 4. 坏 token / 缺 token → 401；未带 cookie 的 /sessions 仍 401。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const HOST = '127.0.0.1'
const PORT = 8941

async function startServer() {
  const { createHttpHost } = await import('../src/httpHost')
  const { createSessionHost } = await import('../src/sessionHost')
  const { createLaunchAuth } = await import('../src/auth')
  const dir = mkdtempSync(join(tmpdir(), 'atlasweb-redeem-'))
  const sessionHost = createSessionHost({ productId: 'atlascode', scopes: [{ scopeId: 'main', storageDir: dir }] })
  const auth = createLaunchAuth({ secret: 'redeem-test-secret-32-bytes!!!!!!!!' })
  const server = createHttpHost({ sessionHost, auth })
  await new Promise<void>(resolve => server.listen(PORT, HOST, resolve))
  await sessionHost.start()
  return { base: `http://${HOST}:${PORT}`, auth, async stop() { await new Promise<void>(r => server.close(() => r())); await sessionHost.close(); rmSync(dir, { recursive: true, force: true }) } }
}

describe('auth redeem bootstrap route', () => {
  test('token→cookie full chain; replay fails; fence not exempted', async () => {
    const ctx = await startServer()
    try {
      // 1. fence 不豁免：非 loopback Host 兑换 → 403
      const evil = await fetch(`${ctx.base}/auth/redeem?token=x`, { headers: { host: 'evil.example.com' } })
      expect([403, 401]).toContain(evil.status)
      // 3/4. 坏 token / 重放：先发一个真 token，兑换两次
      const token = ctx.auth.issueLaunchToken()
      const bad = await fetch(`${ctx.base}/auth/redeem?token=not-a-token`, { headers: { host: `${HOST}:${PORT}` } })
      expect(bad.status).toBe(401)
      const missing = await fetch(`${ctx.base}/auth/redeem`, { headers: { host: `${HOST}:${PORT}` } })
      expect(missing.status).toBe(401)
      // 2. 合法兑换 → 200 + Set-Cookie
      const ok = await fetch(`${ctx.base}/auth/redeem?token=${encodeURIComponent(token)}`, { headers: { host: `${HOST}:${PORT}` } })
      expect(ok.status).toBe(200)
      const setCookie = ok.headers.get('set-cookie') ?? ''
      expect(setCookie).toContain('atlas_session=')
      expect(setCookie).toContain('HttpOnly')
      expect(setCookie).toContain('SameSite=Strict')
      const cookie = /atlas_session=([^;]+)/.exec(setCookie)![1]!
      // token→cookie→四面：list 直连 200
      const list = await fetch(`${ctx.base}/sessions`, { headers: { host: `${HOST}:${PORT}`, cookie: `atlas_session=${cookie}` } })
      expect(list.status).toBe(200)
      // 3. 重放同 token → 401
      const replay = await fetch(`${ctx.base}/auth/redeem?token=${encodeURIComponent(token)}`, { headers: { host: `${HOST}:${PORT}` } })
      expect(replay.status).toBe(401)
      // 未带 cookie 的 /sessions 仍 401
      const noCookie = await fetch(`${ctx.base}/sessions`, { headers: { host: `${HOST}:${PORT}` } })
      expect(noCookie.status).toBe(401)
      // CWE-522 非环境型凭据路径：Authorization: Bearer <credential> 等价
      //（不随浏览器自动附着——E2E/CLI 客户端零跨端口 cookie jar 暴露）
      const bearer = await fetch(`${ctx.base}/sessions`, { headers: { host: `${HOST}:${PORT}`, authorization: `Bearer ${cookie}` } })
      expect(bearer.status).toBe(200)
      const badBearer = await fetch(`${ctx.base}/sessions`, { headers: { host: `${HOST}:${PORT}`, authorization: `Bearer tampered.${cookie}` } })
      expect(badBearer.status).toBe(401)
      const junkBearer = await fetch(`${ctx.base}/sessions`, { headers: { host: `${HOST}:${PORT}`, authorization: 'Bearer nonsense' } })
      expect(junkBearer.status).toBe(401)
    } finally {
      await ctx.stop()
    }
  })
})
