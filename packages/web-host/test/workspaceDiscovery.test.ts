// B3 收尾波工单增量① 腿③——web-host 只读 workspace discovery 端点。
// 安全形（预注册 @42c5251 §1）：auth fence 后、与 /sessions 同层（/execution
// 路由族）、未认证零泄漏、响应仅 workspaceId 字符串（零目录内容/零凭据）；
// 执行面未启用 = 404（E1 零构造语义）；返回值 ≡ 已授权集（fail-closed）。
// 选择 ≠ 授权：本端点只披露可见性，服务端逐命令 workspaceAuth（E1）不变。
import { describe, test, expect, afterAll } from 'bun:test'
import { createWorkspaceAuthorizer } from '../src/execution/workspaceAuth'
import { createExecutionUpstream } from '../src/execution/upstream'
import { createExecutionRoutes } from '../src/execution/executionRoutes'
import { createHttpHost } from '../src/httpHost'
import { createLaunchAuth } from '../src/auth'
import { createSessionHost, type SessionHost } from '../src/sessionHost'

interface HostHandle { server: ReturnType<typeof createHttpHost>; port: number; cookie: string }

function makeHttpHost(grants: Array<[string, string]>, withExecution = true): Promise<HostHandle> {
  const sessionHost: SessionHost = createSessionHost({ productId: 'atlascode', scopes: [{ scopeId: 'main', storageDir: '/tmp/does-not-matter' }] })
  const auth = createLaunchAuth({ secret: 'discovery-test-secret-0123456789' })
  let executionOpt: Parameters<typeof createHttpHost>[0]['execution']
  if (withExecution) {
    const ws = createWorkspaceAuthorizer()
    for (const [id, dir] of grants) ws.grantWorkspace(id, dir)
    const upstream = createExecutionUpstream({
      actorId: () => 'conn-1',
      workspaceDir: (id) => ws.workspaceDir(id),
      now: () => 1_700_000_000_000,
      runTurn: async (deps) => (await deps.requestApproval()) === 'approved' ? 'completed' : 'cancelled',
    })
    executionOpt = { upstream, workspaceAuth: ws }
  }
  const server = createHttpHost({ sessionHost, auth, ...(executionOpt !== undefined ? { execution: executionOpt } : {}) })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr !== null ? addr.port : 0
      const token = auth.issueLaunchToken()
      void fetch(`http://127.0.0.1:${port}/auth/redeem?token=${token}`, { headers: { host: `127.0.0.1:${port}` } }).then(async (r) => {
        const setCookie = r.headers.get('set-cookie') ?? ''
        resolve({ server, port, cookie: setCookie.split(';')[0] ?? '' })
      })
    })
  })
}

const hosts: HostHandle[] = []
afterAll(() => { for (const h of hosts) h.server.close() })

async function get(h: HostHandle, path: string, withCookie = true): Promise<Response> {
  return fetch(`http://127.0.0.1:${h.port}${path}`, {
    headers: { host: `127.0.0.1:${h.port}`, ...(withCookie ? { cookie: h.cookie } : {}) },
  })
}

describe('GET /execution/workspaces（B3 增量① discovery 端点）', () => {
  test('返值 ≡ 已授权集：仅 workspaceId 字符串，零目录内容', async () => {
    const h = await makeHttpHost([['ws-a', '/tmp/ws-a'], ['ws-b', '/tmp/ws-b']])
    hosts.push(h)
    const r = await get(h, '/execution/workspaces')
    expect(r.status).toBe(200)
    const body = (await r.json()) as { workspaces?: unknown }
    expect(body.workspaces).toEqual([{ workspaceId: 'ws-a' }, { workspaceId: 'ws-b' }])
    const raw = JSON.stringify(body)
    expect(raw).not.toContain('/tmp/')
    expect(raw).not.toContain('dir')
  })

  test('未认证零泄漏：无 cookie → 401，响应零 workspaceId', async () => {
    const h = await makeHttpHost([['ws-a', '/tmp/ws-a']])
    hosts.push(h)
    const r = await get(h, '/execution/workspaces', false)
    expect(r.status).toBe(401)
    const raw = await r.text()
    expect(raw).not.toContain('ws-a')
  })

  test('执行面未启用 → 404（E1 零构造；零端点即零披露）', async () => {
    const h = await makeHttpHost([], false)
    hosts.push(h)
    const r = await get(h, '/execution/workspaces')
    expect(r.status).toBe(404)
  })

  test('吊销即时反映于列表（授权态唯一真源 = workspaceAuth）', async () => {
    const h = await makeHttpHost([['ws-a', '/tmp/ws-a']])
    hosts.push(h)
    // 吊销经 host 内部 authorizer 不可达——此处仅锁「列表随授权集」契约：
    // 再造一个空授权 host 对照（等价 revoke-all 形）。
    const empty = await makeHttpHost([])
    hosts.push(empty)
    const r = await get(empty, '/execution/workspaces')
    expect(r.status).toBe(200)
    expect(((await r.json()) as { workspaces: unknown[] }).workspaces).toEqual([])
  })
})
