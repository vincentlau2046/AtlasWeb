import { describe, expect, test } from 'bun:test'

// 静态面（消费端组装缺口收口，2026-11-20 用户裁「有缺口就解决」）判据：
// 1. --static <dir> → httpHost 以纯 fallback 形同源服静态 UI：GET / →
//    index.html；带 hash 资产 → immutable；API 路由优先不受影响；
// 2. 无 cookie 可达（UI 首载 boot 路径：token 在 URL、JS 兑换在前）——
//    静态内容为 npm 已公开资产，零新增泄露面；fence 照常全局面生效；
// 3. fail-closed：目录穿越（点段原形/编码形）、symlink 逃逸、目录列清单、
//    非 GET、staticDir 不存在 → 拒；无 --static → 行为零变化。
import { request as httpRequest } from 'node:http'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHttpHost } from '../src/httpHost'
import { createSessionHost } from '../src/sessionHost'
import { createLaunchAuth } from '../src/auth'

const HOST = '127.0.0.1'
const PORT = 8941

const INDEX_HTML = '<!doctype html><html><head><title>aw-static-fixture</title></head><body>AW-FIXTURE-MARKER</body></html>'
const APP_JS = "console.log('AW-JS-MARKER')\n"
const APP_CSS = '.aw{color:red}\n'

/** 原形路径请求（node:http 不做客户端归一化——穿越负锁必须打原形）。 */
function rawGet(port: number, path: string, headers: Record<string, string> = {}): Promise<{ status: number; contentType: string; cacheControl: string; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: HOST, port, path, headers }, res => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => resolve({
        status: res.statusCode ?? 0,
        contentType: String(res.headers['content-type'] ?? ''),
        cacheControl: String(res.headers['cache-control'] ?? ''),
        body: Buffer.concat(chunks).toString('utf8'),
      }))
    })
    req.on('error', reject)
    req.end()
  })
}

interface StaticCtx { base: string; cookie: string; staticDir: string; stop(): Promise<void> }

async function startServer(opts: { staticDir?: string } = {}): Promise<StaticCtx> {
  const dir = mkdtempSync(join(tmpdir(), 'atlasweb-static-sessions-'))
  // seeded 会话（API 面不受静态面影响判据用）
  writeFileSync(join(dir, 's1.jsonl'), `${JSON.stringify({ type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2026-11-20T08:00:00.000Z', message: { role: 'user', content: 'hi' } })}\n`)
  const sessionHost = createSessionHost({ productId: 'atlascode', scopes: [{ scopeId: 'main', storageDir: dir }] })
  const auth = createLaunchAuth({ secret: 'static-face-test-secret-32-bytes!!!' })
  const server = createHttpHost({
    sessionHost,
    auth,
    ...(opts.staticDir !== undefined ? { staticDir: opts.staticDir } : {}),
  })
  await sessionHost.start()
  await new Promise<void>(resolve => server.listen(PORT, HOST, resolve))
  const cookie = auth.redeemLaunchToken(auth.issueLaunchToken())!
  return {
    base: `http://${HOST}:${PORT}`,
    cookie,
    staticDir: opts.staticDir ?? '',
    async stop() {
      await new Promise<void>(resolve => server.close(() => resolve()))
      await sessionHost.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

function makeStaticFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'atlasweb-static-dist-'))
  writeFileSync(join(root, 'index.html'), INDEX_HTML)
  mkdirSync(join(root, 'assets'))
  writeFileSync(join(root, 'assets', 'app-H4SH.js'), APP_JS)
  writeFileSync(join(root, 'assets', 'app.css'), APP_CSS)
  mkdirSync(join(root, 'sub'))
  symlinkSync('/etc/passwd', join(root, 'escape-link'))
  return root
}

describe('httpHost static face (--static 同源组装)', () => {
  test('GET / → index.html 200（无 cookie boot 路径）+ no-cache；hash 资产 immutable', async () => {
    const staticDir = makeStaticFixture()
    const ctx = await startServer({ staticDir })
    try {
      const home = await rawGet(PORT, '/', { host: `${HOST}:${PORT}` })
      expect(home.status).toBe(200)
      expect(home.contentType).toContain('text/html')
      expect(home.body).toContain('AW-FIXTURE-MARKER')
      expect(home.cacheControl).toContain('no-cache')

      const js = await rawGet(PORT, '/assets/app-H4SH.js', { host: `${HOST}:${PORT}` })
      expect(js.status).toBe(200)
      expect(js.contentType).toContain('text/javascript')
      expect(js.body).toBe(APP_JS)
      expect(js.cacheControl).toContain('immutable')

      const css = await rawGet(PORT, '/assets/app.css', { host: `${HOST}:${PORT}` })
      expect(css.status).toBe(200)
      expect(css.contentType).toContain('text/css')
    } finally {
      rmSync(staticDir, { recursive: true, force: true })
      await ctx.stop()
    }
  })

  test('穿越负锁：点段原形/编码形 → 拒，响应体零 /etc/passwd 内容', async () => {
    const staticDir = makeStaticFixture()
    const ctx = await startServer({ staticDir })
    try {
      for (const path of ['/../../etc/passwd', '/%2e%2e/%2e%2e/%2e%2e/etc/passwd', '/assets/..%2f..%2f..%2fetc%2fpasswd']) {
        const res = await rawGet(PORT, path, { host: `${HOST}:${PORT}` })
        expect(res.status).toBeGreaterThanOrEqual(400)
        expect(res.body).not.toContain('root:')
      }
    } finally {
      rmSync(staticDir, { recursive: true, force: true })
      await ctx.stop()
    }
  })

  test('symlink 逃逸拒（pre-auth）+ 目录不列清单 + 未知路径 404（带 cookie）/401（无 cookie 零漂移）+ 非 GET 404', async () => {
    const staticDir = makeStaticFixture()
    const ctx = await startServer({ staticDir })
    try {
      const escape = await rawGet(PORT, '/escape-link', { host: `${HOST}:${PORT}` })
      expect(escape.status).toBe(403)
      expect(escape.body).not.toContain('root:')

      const dirList = await rawGet(PORT, '/sub', { host: `${HOST}:${PORT}`, cookie: `atlas_session=${ctx.cookie}` })
      expect(dirList.status).toBe(403) // 目录不列清单（fail-closed 403，非 404）

      const missing = await rawGet(PORT, '/missing.png', { host: `${HOST}:${PORT}`, cookie: `atlas_session=${ctx.cookie}` })
      expect(missing.status).toBe(404)
      // 静态 miss 穿透原链：无 cookie 仍 401（既有行为零漂移）
      const missingNoAuth = await rawGet(PORT, '/missing.png', { host: `${HOST}:${PORT}` })
      expect(missingNoAuth.status).toBe(401)

      const post = await new Promise<{ status: number }>((resolve, reject) => {
        const req = httpRequest({ host: HOST, port: PORT, path: '/', method: 'POST', headers: { host: `${HOST}:${PORT}`, cookie: `atlas_session=${ctx.cookie}` } }, res => {
          res.resume()
          res.on('end', () => resolve({ status: res.statusCode ?? 0 }))
        })
        req.on('error', reject)
        req.end()
      })
      expect(post.status).toBe(404)
    } finally {
      rmSync(staticDir, { recursive: true, force: true })
      await ctx.stop()
    }
  })

  test('API 面不受影响：/sessions 带 cookie → 200 envelope；无 cookie → 401（auth 先于 API）', async () => {
    const staticDir = makeStaticFixture()
    const ctx = await startServer({ staticDir })
    try {
      const list = await rawGet(PORT, '/sessions?scopeId=main', { host: `${HOST}:${PORT}`, cookie: `atlas_session=${ctx.cookie}` })
      expect(list.status).toBe(200)
      const parsed = JSON.parse(list.body) as { kind: string; of?: string }
      expect(parsed.kind).toBe('response')

      const noAuth = await rawGet(PORT, '/sessions?scopeId=main', { host: `${HOST}:${PORT}` })
      expect(noAuth.status).toBe(401)
    } finally {
      rmSync(staticDir, { recursive: true, force: true })
      await ctx.stop()
    }
  })

  test('无 staticDir → 行为零变化：GET / 无 cookie 仍 401（auth 先于 fallback，既有语义）', async () => {
    const ctx = await startServer()
    try {
      const home = await rawGet(PORT, '/', { host: `${HOST}:${PORT}` })
      expect(home.status).toBe(401)
    } finally {
      await ctx.stop()
    }
  })

  test('staticDir 不存在 → createHttpHost fail-closed throw', () => {
    const sessionHost = createSessionHost({ productId: 'atlascode', scopes: [{ scopeId: 'main', storageDir: '/tmp' }] })
    const auth = createLaunchAuth({ secret: 'static-face-test-secret-32-bytes!!!' })
    expect(() => createHttpHost({ sessionHost, auth, staticDir: '/nonexistent-static-dir-xyz' })).toThrow()
    void sessionHost.close().catch(() => {})
  })

  test('staticDir 相对路径 → fail-closed throw', () => {
    const sessionHost = createSessionHost({ productId: 'atlascode', scopes: [{ scopeId: 'main', storageDir: '/tmp' }] })
    const auth = createLaunchAuth({ secret: 'static-face-test-secret-32-bytes!!!' })
    expect(() => createHttpHost({ sessionHost, auth, staticDir: 'relative/dist' })).toThrow()
    void sessionHost.close().catch(() => {})
  })
})
