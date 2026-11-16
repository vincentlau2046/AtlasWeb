import { describe, expect, test } from 'bun:test'
import { launchHost, makeSeedDir, rmDir, stdTranscript, httpRequest, redeemForCookie, cookieHeaderValue } from './helpers'

// E2E-02 鉴权全链（真实进程，计划 v1 P0）：
// 1. 无 cookie → 401；
// 2. 合法 launch token → GET /auth/redeem → 200 + Set-Cookie（HttpOnly/SameSite=Strict/Path=/）；
// 3. token 单次性：重放 redeem 必败 401；坏/缺 token 亦 401；
// 4. 合法 cookie → 四面路由 200；篡改 cookie → 401；
// 5. fence 对引导路由不豁免：非 loopback Host / 跨源 Origin 照拒 403。

let host: Awaited<ReturnType<typeof launchHost>>
let dir: string

describe('E2E-02 auth chain over real process', () => {
  test('setup: launch host + redeem once for later legs', async () => {
    dir = makeSeedDir('atlasweb-e2e02-', { 'sess-1': stdTranscript() })
    host = await launchHost({ scopes: [{ id: 'main', dir }] })
  }, 30000)

  test('no cookie → 401', async () => {
    const res = await httpRequest(host.port, '/sessions')
    expect(res.status).toBe(401)
  })

  test('valid token → redeem 200 + Set-Cookie attrs (HttpOnly, SameSite=Strict, Path=/)', async () => {
    const res = await httpRequest(host.port, `/auth/redeem?token=${encodeURIComponent(host.token)}`)
    expect(res.status).toBe(200)
    const setCookie = res.headers['set-cookie']?.[0] ?? ''
    expect(setCookie).toContain('atlas_session=')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Strict')
    expect(setCookie).toContain('Path=/')
    // 兑换出的 cookie 立即可用
    const list = await httpRequest(host.port, '/sessions', { headers: { cookie: cookieHeaderValue(setCookie) } })
    expect(list.status).toBe(200)
  })

  test('token single-use: replay redeem → 401; bad/missing token → 401', async () => {
    const replay = await httpRequest(host.port, `/auth/redeem?token=${encodeURIComponent(host.token)}`)
    expect(replay.status).toBe(401)
    const bad = await httpRequest(host.port, '/auth/redeem?token=bogus-token-value')
    expect(bad.status).toBe(401)
    const missing = await httpRequest(host.port, '/auth/redeem')
    expect(missing.status).toBe(401)
  })

  test('tampered cookie → 401', async () => {
    // token 已在前面消耗；用 fail 路径重新发一枚（每次启动仅一枚 token ——
    // 此处复用 setup 时兑好的 cookie 不可能，故验证：伪造 cookie 形态一律 401）
    const forged = 'atlas_session=AAAA0000.BBBB1111.CCCC2222'
    const res = await httpRequest(host.port, '/sessions', { headers: { cookie: forged } })
    expect(res.status).toBe(401)
    const garbage = await httpRequest(host.port, '/sessions', { headers: { cookie: 'atlas_session=not-a-cookie' } })
    expect(garbage.status).toBe(401)
  })

  test('fence not exempted on bootstrap route: non-loopback Host → 403 even with valid token', async () => {
    // 重新 launch 一枚 host 拿新 token（上一枚已消费）
    const dir2 = makeSeedDir('atlasweb-e2e02b-', { 'sess-1': stdTranscript() })
    try {
      const host2 = await launchHost({ scopes: [{ id: 'main', dir: dir2 }] })
      try {
        const evil = await httpRequest(host2.port, `/auth/redeem?token=${encodeURIComponent(host2.token)}`, { headers: { host: 'evil.example.com' } })
        expect([403, 401]).toContain(evil.status)
        expect(evil.status).toBe(403) // fence 先于 auth，必须 403
        // 且该 token 未被消费（fence 拒绝时未触达 redeem）——重入合法 Host 仍可兑换
        const legit = await httpRequest(host2.port, `/auth/redeem?token=${encodeURIComponent(host2.token)}`)
        expect(legit.status).toBe(200)
      } finally {
        await host2.stop()
      }
    } finally {
      rmDir(dir2)
    }
  }, 30000)

  test('cross-origin Origin → 403 on session faces', async () => {
    const dir3 = makeSeedDir('atlasweb-e2e02c-', { 'sess-1': stdTranscript() })
    try {
      const host3 = await launchHost({ scopes: [{ id: 'main', dir: dir3 }] })
      try {
        const cookie = await redeemForCookie(host3.port, host3.token)
        const cross = await httpRequest(host3.port, '/sessions', { headers: { cookie: cookieHeaderValue(cookie), origin: 'http://evil.example.com' } })
        expect(cross.status).toBe(403)
      } finally {
        await host3.stop()
      }
    } finally {
      rmDir(dir3)
    }
  }, 30000)

  test('expired cookie: short ttl via --session-ttl-ms → fresh 200 then 401 after expiry', async () => {
    const dir4 = makeSeedDir('atlasweb-e2e02d-', { 'sess-1': stdTranscript() })
    try {
      const host4 = await launchHost({ scopes: [{ id: 'main', dir: dir4 }], extraArgs: ['--session-ttl-ms', '150'] })
      try {
        const cookie4 = cookieHeaderValue(await redeemForCookie(host4.port, host4.token))
        const fresh = await httpRequest(host4.port, '/sessions', { headers: { cookie: cookie4 } })
        expect(fresh.status).toBe(200)
        await new Promise(resolve => setTimeout(resolve, 400))
        const expired = await httpRequest(host4.port, '/sessions', { headers: { cookie: cookie4 } })
        expect(expired.status).toBe(401)
      } finally {
        await host4.stop()
      }
    } finally {
      rmDir(dir4)
    }
  }, 30000)

  test('Bearer credential form: redeem credential accepted via Authorization header (CWE-522 disposition)', async () => {
    const dir5 = makeSeedDir('atlasweb-e2e02e-', { 'sess-1': stdTranscript() })
    try {
      const host5 = await launchHost({ scopes: [{ id: 'main', dir: dir5 }] })
      try {
        const setCookie = await redeemForCookie(host5.port, host5.token)
        const credential = setCookie.split(';')[0]!.split('=').slice(1).join('=')
        const viaBearer = await httpRequest(host5.port, '/sessions', { headers: { authorization: `Bearer ${credential}` } })
        expect(viaBearer.status).toBe(200)
        const badBearer = await httpRequest(host5.port, '/sessions', { headers: { authorization: 'Bearer forged-credential' } })
        expect(badBearer.status).toBe(401)
        // redeem 单次性对 Bearer 形态同样承载：token 已消费，无法再取凭据
        const replay = await httpRequest(host5.port, `/auth/redeem?token=${encodeURIComponent(host5.token)}`)
        expect(replay.status).toBe(401)
      } finally {
        await host5.stop()
      }
    } finally {
      rmDir(dir5)
    }
  }, 30000)

  test('teardown: SIGTERM graceful', async () => {
    const code = await host.stop()
    expect(code).toBe(0)
    rmDir(dir)
  }, 30000)
})
