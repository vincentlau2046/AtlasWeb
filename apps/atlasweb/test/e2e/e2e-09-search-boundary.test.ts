import { describe, expect, test } from 'bun:test'
import { launchHost, makeSeedDir, rmDir, httpRequest, redeemForCookie, cookieHeaderValue } from './helpers'

// E2E-09 search 面边界（计划 v1 P2，总约 §4「每项给数值、边界±1」）：
// 1. query 码点界：1（下界）/ 256（上界）→ 200；0 / 257 → 400 invalidRequest；
// 2. 边界用多码面字符（emoji = 2 码点、组合字素）验证「码点非字节/非字素」；
// 3. URL 保留字与 unicode 往返（&, =, %, 中文, emoji）；
// 4. 无命中 → 200 空结果（错误不以空结果掩盖的反向：空结果不是错误）；
// 5. snippet ≤512；search 命中 ⊆ list 会话集；
// 6. 未授权 scope → 403 scopeDenied（非空列表掩盖）。

let host: Awaited<ReturnType<typeof launchHost>>
let dir: string
let cookie: string

describe('E2E-09 search face boundaries', () => {
  test('setup: launch + redeem + multi-session seed', async () => {
    dir = makeSeedDir('atlasweb-e2e09-', {
      'alpha': [
        { type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2026-11-16T08:00:00.000Z', message: { role: 'user', content: 'the quick brown fox 跳过 lazy dog 🦊' } },
      ],
      'beta': [
        { type: 'user', uuid: 'u2', parentUuid: null, timestamp: '2026-11-16T09:00:00.000Z', message: { role: 'user', content: 'unrelated content here' } },
      ],
      'gamma': [
        { type: 'user', uuid: 'u3', parentUuid: null, timestamp: '2026-11-16T10:00:00.000Z', message: { role: 'user', content: 'query=term&lang=zh%20CN 保留字 stress' } },
      ],
    })
    host = await launchHost({ scopes: [{ id: 'main', dir }] })
    cookie = cookieHeaderValue(await redeemForCookie(host.port, host.token))
  }, 30000)

  test('query code-point bounds: 1 ok / 256 ok / 0→400 / 257→400', async () => {
    const one = await httpRequest(host.port, `/sessions/search?scopeId=main&q=${encodeURIComponent('x')}`, { headers: { cookie } })
    expect(one.status).toBe(200)
    const e256 = await httpRequest(host.port, `/sessions/search?scopeId=main&q=${encodeURIComponent('字'.repeat(256))}`, { headers: { cookie } })
    expect(e256.status).toBe(200)
    const zero = await httpRequest(host.port, '/sessions/search?scopeId=main&q=', { headers: { cookie } })
    expect(zero.status).toBe(400)
    expect((JSON.parse(zero.body) as { code?: string }).code).toBe('invalidRequest')
    const e257 = await httpRequest(host.port, `/sessions/search?scopeId=main&q=${encodeURIComponent('字'.repeat(257))}`, { headers: { cookie } })
    expect(e257.status).toBe(400)
    // 码点计数（emoji = 1 码点 / 2 UTF-16 单元）：256 emoji = 256 码点 → 200
    const emoji256 = await httpRequest(host.port, `/sessions/search?scopeId=main&q=${encodeURIComponent('🦊'.repeat(256))}`, { headers: { cookie } })
    expect(emoji256.status).toBe(200)
    // 257 emoji = 257 码点 → 400（±1 覆盖）
    const emoji257 = await httpRequest(host.port, `/sessions/search?scopeId=main&q=${encodeURIComponent('🦊'.repeat(257))}`, { headers: { cookie } })
    expect(emoji257.status).toBe(400)
  })

  test('URL-reserved and unicode query roundtrip', async () => {
    const amp = await httpRequest(host.port, `/sessions/search?scopeId=main&q=${encodeURIComponent('query=term&lang=zh%20CN')}`, { headers: { cookie } })
    expect(amp.status).toBe(200)
    const ampBody = JSON.parse(amp.body) as { results: Array<{ sessionId: string }> }
    expect(ampBody.results.some(r => r.sessionId === 'gamma')).toBe(true)

    const cjk = await httpRequest(host.port, `/sessions/search?scopeId=main&q=${encodeURIComponent('跳过')}`, { headers: { cookie } })
    expect(cjk.status).toBe(200)
    expect((JSON.parse(cjk.body) as { results: Array<{ sessionId: string }> }).results.some(r => r.sessionId === 'alpha')).toBe(true)
  })

  test('no-hit → 200 empty results (absence is not an error); hits ⊆ list ids; snippet ≤512', async () => {
    const miss = await httpRequest(host.port, '/sessions/search?scopeId=main&q=zzz-no-such-term', { headers: { cookie } })
    expect(miss.status).toBe(200)
    expect((JSON.parse(miss.body) as { results: unknown[] }).results).toHaveLength(0)

    const hit = await httpRequest(host.port, '/sessions/search?scopeId=main&q=quick%20brown', { headers: { cookie } })
    const hitBody = JSON.parse(hit.body) as { results: Array<{ sessionId: string; snippet: string }> }
    expect(hitBody.results.length).toBeGreaterThan(0)
    const list = JSON.parse((await httpRequest(host.port, '/sessions?scopeId=main', { headers: { cookie } })).body) as { sessions: Array<{ sessionId: string }> }
    const listIds = new Set(list.sessions.map(s => s.sessionId))
    for (const r of hitBody.results) {
      expect(listIds.has(r.sessionId)).toBe(true)
      expect(r.snippet.length).toBeLessThanOrEqual(512)
    }
  })

  test('unmapped scope → 403 scopeDenied (not empty-list masking)', async () => {
    const denied = await httpRequest(host.port, '/sessions/search?scopeId=other&q=x', { headers: { cookie } })
    expect(denied.status).toBe(403)
    expect((JSON.parse(denied.body) as { code?: string }).code).toBe('scopeDenied')
  })

  test('teardown', async () => {
    const code = await host.stop()
    expect(code).toBe(0)
    rmDir(dir)
  }, 30000)
})
