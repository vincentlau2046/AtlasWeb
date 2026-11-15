import { describe, expect, test } from 'bun:test'

// G2 安全腿判据（总约 §4 / 工单 §6 格 H）：
// 1. launch token → 签名 cookie 往返；篡改/过期/错 key 一律拒；
// 2. token 单次兑换（ redeemed token 不再发 cookie）；
// 3. fence 仅放行 loopback Host/Origin，其余 fail-closed；
// 4. 常数时间比较路径（实现在 sign/verify 内部，测试以行为面覆盖）。
describe('launch token / signed cookie auth', () => {
  test('roundtrip: valid token redeems a verifiable session cookie', async () => {
    const { createLaunchAuth } = await import('../src/auth')
    const auth = createLaunchAuth({ secret: 'test-secret-32-bytes-long!!!!!!' })
    const token = auth.issueLaunchToken()
    const cookie = auth.redeemLaunchToken(token)
    expect(cookie).toBeTruthy()
    expect(auth.verifySessionCookie(cookie!)).toBe(true)
  })

  test('rejects: tampered cookie, wrong key, garbage', async () => {
    const { createLaunchAuth } = await import('../src/auth')
    const auth = createLaunchAuth({ secret: 'test-secret-32-bytes-long!!!!!!' })
    const token = auth.issueLaunchToken()
    const cookie = auth.redeemLaunchToken(token)!
    const forged = cookie.slice(0, -4) + 'beef'
    expect(auth.verifySessionCookie(forged)).toBe(false)
    expect(auth.verifySessionCookie('not-a-cookie')).toBe(false)
    expect(auth.verifySessionCookie('')).toBe(false)
    const other = createLaunchAuth({ secret: 'another-secret-32-bytes-long!!!!!' })
    const otherCookie = other.redeemLaunchToken(other.issueLaunchToken())!
    expect(auth.verifySessionCookie(otherCookie)).toBe(false)
  })

  test('launch token redeems exactly once', async () => {
    const { createLaunchAuth } = await import('../src/auth')
    const auth = createLaunchAuth({ secret: 'test-secret-32-bytes-long!!!!!!' })
    const token = auth.issueLaunchToken()
    expect(auth.redeemLaunchToken(token)).toBeTruthy()
    expect(auth.redeemLaunchToken(token)).toBe(null)
    expect(auth.redeemLaunchToken('bogus-token')).toBe(null)
  })

  test('session cookie expires per ttl', async () => {
    const { createLaunchAuth } = await import('../src/auth')
    const auth = createLaunchAuth({ secret: 'test-secret-32-bytes-long!!!!!!', sessionTtlMs: -1 })
    const cookie = auth.redeemLaunchToken(auth.issueLaunchToken())!
    // ttl<0 → 已过期
    expect(auth.verifySessionCookie(cookie)).toBe(false)
  })
})

describe('loopback Host/Origin fence', () => {
  test('allows loopback Host and same-origin/absent Origin; rejects others', async () => {
    const { isLoopbackRequest } = await import('../src/fence')
    // 允许：127.0.0.1 / localhost / [::1]，无 Origin（非浏览器客户端或同源 GET）
    expect(isLoopbackRequest({ host: '127.0.0.1:8917', origin: undefined })).toBe(true)
    expect(isLoopbackRequest({ host: 'localhost:8917', origin: 'http://localhost:8917' })).toBe(true)
    expect(isLoopbackRequest({ host: '[::1]:8917', origin: undefined })).toBe(true)
    // 同 loopback 不同 authority（localhost vs 127.0.0.1）仍按跨源拒绝
    expect(isLoopbackRequest({ host: 'localhost:8917', origin: 'http://127.0.0.1:8917' })).toBe(false)
    // 拒绝：非 loopback Host、跨源 Origin、恶意 Host 形
    expect(isLoopbackRequest({ host: 'evil.example.com', origin: undefined })).toBe(false)
    expect(isLoopbackRequest({ host: '127.0.0.1:8917', origin: 'http://evil.example.com' })).toBe(false)
    expect(isLoopbackRequest({ host: '169.254.169.254', origin: undefined })).toBe(false)
    expect(isLoopbackRequest({ host: undefined, origin: undefined })).toBe(false)
  })
})
