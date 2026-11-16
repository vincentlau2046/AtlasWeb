import { describe, expect, test } from 'bun:test'
import { launchHost, makeSeedDir, rmDir, httpRequest, redeemForCookie, cookieHeaderValue, type SeedLine } from './helpers'

// E2E-08 双 host 进程隔离（计划 v1 P2，格 F 的进程级形态）：
// 两独立进程、两端口、两 scope 域、不同 secret、同名 sessionId：
// 1. 各自 list/replay 内容互不串域（含反向 scopeDenied）；
// 2. 跨进程凭据不互认（A 的 cookie 在 B → 401，不同 secret）；
// 3. kill A（SIGKILL 强杀）后 B 继续服务（进程级 close-A 不伤 B）。

const A_SESS: SeedLine[] = [
  { type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2026-11-16T08:00:00.000Z', message: { role: 'user', content: 'content-from-instance-A' } },
]
const B_SESS: SeedLine[] = [
  { type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2026-11-16T09:00:00.000Z', message: { role: 'user', content: 'content-from-instance-B' } },
]

let hostA: Awaited<ReturnType<typeof launchHost>>
let hostB: Awaited<ReturnType<typeof launchHost>>
let dirA: string
let dirB: string
let cookieA: string
let cookieB: string

describe('E2E-08 dual host process isolation', () => {
  test('setup: two hosts, same sessionId, different domains/secrets', async () => {
    dirA = makeSeedDir('atlasweb-e2e08a-', { 'sess-1': A_SESS })
    dirB = makeSeedDir('atlasweb-e2e08b-', { 'sess-1': B_SESS })
    hostA = await launchHost({ scopes: [{ id: 'main', dir: dirA }], secret: 'instance-a-secret-32-bytes!!!!!!' })
    hostB = await launchHost({ scopes: [{ id: 'main', dir: dirB }], secret: 'instance-b-secret-32-bytes!!!!!!' })
    expect(hostA.port).not.toBe(hostB.port)
    cookieA = cookieHeaderValue(await redeemForCookie(hostA.port, hostA.token))
    cookieB = cookieHeaderValue(await redeemForCookie(hostB.port, hostB.token))
  }, 60000)

  test('same sessionId, per-instance projections never cross domains', async () => {
    const listA = JSON.parse((await httpRequest(hostA.port, '/sessions?scopeId=main', { headers: { cookie: cookieA } })).body) as { sessions: Array<{ sessionId: string }> }
    const listB = JSON.parse((await httpRequest(hostB.port, '/sessions?scopeId=main', { headers: { cookie: cookieB } })).body) as { sessions: Array<{ sessionId: string }> }
    expect(listA.sessions.map(s => s.sessionId)).toEqual(['sess-1'])
    expect(listB.sessions.map(s => s.sessionId)).toEqual(['sess-1'])

    const repA = (await httpRequest(hostA.port, '/sessions/sess-1/replay?scopeId=main', { headers: { cookie: cookieA } })).body
    const repB = (await httpRequest(hostB.port, '/sessions/sess-1/replay?scopeId=main', { headers: { cookie: cookieB } })).body
    expect(repA).toContain('content-from-instance-A')
    expect(repB).toContain('content-from-instance-B')
    expect(repA).not.toContain('content-from-instance-B')
    expect(repB).not.toContain('content-from-instance-A')

    // 反向 scopeDenied：未映射 scope 两侧一致拒绝
    for (const [port, cookie] of [[hostA.port, cookieA], [hostB.port, cookieB]] as const) {
      const denied = await httpRequest(port, '/sessions?scopeId=other', { headers: { cookie } })
      expect(denied.status).toBe(403)
    }
  })

  test('credentials are instance-scoped: A cookie on B → 401 (different secret)', async () => {
    const cross = await httpRequest(hostB.port, '/sessions', { headers: { cookie: cookieA } })
    expect(cross.status).toBe(401)
    const cross2 = await httpRequest(hostA.port, '/sessions', { headers: { cookie: cookieB } })
    expect(cross2.status).toBe(401)
  })

  test('SIGKILL A → B keeps serving (process-level close-A spares-B)', async () => {
    hostA.proc.kill('SIGKILL')
    await new Promise(r => hostA.proc.once('exit', r))
    // B 不受影响：list + replay + search 继续可用
    const list = await httpRequest(hostB.port, '/sessions?scopeId=main', { headers: { cookie: cookieB } })
    expect(list.status).toBe(200)
    const rep = await httpRequest(hostB.port, '/sessions/sess-1/replay?scopeId=main', { headers: { cookie: cookieB } })
    expect(rep.status).toBe(200)
    expect(rep.body).toContain('content-from-instance-B')
    const search = await httpRequest(hostB.port, '/sessions/search?scopeId=main&q=instance-B', { headers: { cookie: cookieB } })
    expect(search.status).toBe(200)
    // A 端口已死：连接必被拒（httpRequest 对连接错误 reject → 捕获即预期）
    let dead = false
    try {
      await httpRequest(hostA.port, '/sessions', { headers: { cookie: cookieA } })
    } catch {
      dead = true
    }
    expect(dead, 'instance A must be unreachable after SIGKILL').toBe(true)
  })

  test('teardown', async () => {
    rmDir(dirA)
    rmDir(dirB)
    if (hostB.proc.exitCode === null && hostB.proc.signalCode === null) {
      const code = await hostB.stop()
      expect(code).toBe(0)
    }
  }, 30000)
})
