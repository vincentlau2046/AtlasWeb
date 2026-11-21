import { describe, test, expect, afterAll } from 'bun:test'
import { createExecutionRoutes, errorStatus } from '../src/execution/executionRoutes'
import { createExecutionUpstream } from '../src/execution/upstream'
import { createWorkspaceAuthorizer } from '../src/execution/workspaceAuth'
import { createHttpHost } from '../src/httpHost'
import { createLaunchAuth } from '../src/auth'
import { createSessionHost, type SessionHost } from '../src/sessionHost'

function makeEnv() {
  const auth0 = createWorkspaceAuthorizer()
  auth0.grantWorkspace('ws1', '/tmp/ws1')
  const upstream = createExecutionUpstream({
    actorId: () => 'conn-1',
    workspaceDir: (id) => auth0.workspaceDir(id),
    runTurn: async () => 'completed',
  })
  return { workspaceAuth: auth0, upstream, routes: createExecutionRoutes({ upstream, workspaceAuth: auth0 }), bareUpstream: (): ReturnType<typeof createExecutionUpstream> => createExecutionUpstream({ actorId: () => 'conn-1', workspaceDir: (id) => auth0.workspaceDir(id), runTurn: async () => 'completed' }) }
}

const submit = { v: 0, type: 'turn.submit', bind: { workspaceId: 'ws1', sessionId: 'sess1', turnId: '' }, payload: { submitId: 's1', text: 'hi' } }

describe('executionRoutes · E1/E2 host 侧预校验', () => {
  test('未授权 workspaceId → 403 workspaceNotGranted 且 upstream 零触达（E1）', async () => {
    const { routes } = makeEnv()
    const r = await routes.dispatch({ ...submit, bind: { workspaceId: 'nope', sessionId: 's', turnId: '' } } as never)
    expect(r.status).toBe(403)
    expect((r.body as { code?: string }).code).toBe('workspaceNotGranted')
  })

  test('bind 形态（空 sessionId / 缺 bind）→ 400 invalidBind 零触达（E2）', async () => {
    const { routes } = makeEnv()
    const r1 = await routes.dispatch({ ...submit, bind: { workspaceId: 'ws1', sessionId: '', turnId: '' } } as never)
    expect(r1.status).toBe(400)
    expect((r1.body as { code?: string }).code).toBe('invalidBind')
    const r2 = await routes.dispatch({ ...submit, bind: undefined } as never)
    expect(r2.status).toBe(400)
  })

  test('未知命令型 → 400 invalidCommand', async () => {
    const { routes } = makeEnv()
    const r = await routes.dispatch({ ...submit, type: 'evil.command' } as never)
    expect(r.status).toBe(400)
    expect((r.body as { code?: string }).code).toBe('invalidCommand')
  })

  test('授权命令 → 200 事件；errorStatus 映射表', async () => {
    const { routes } = makeEnv()
    const r = await routes.dispatch(submit as never)
    expect(r.status).toBe(200)
    expect((r.body as { type?: string }).type).toBe('turn.accepted')
    expect(errorStatus('invalidBind')).toBe(400)
    expect(errorStatus('notFound')).toBe(404)
    expect(errorStatus('approvalBindMismatch')).toBe(403)
    expect(errorStatus('alreadySettled')).toBe(409)
    expect(errorStatus('queueFull')).toBe(429)
    expect(errorStatus('resourceLimit')).toBe(429)
    expect(errorStatus('notImplemented')).toBe(501)
  })

  test('同一 upstream 注入第二 route set → 硬错（§7）', () => {
    const { bareUpstream } = makeEnv()
    const upstream = bareUpstream()
    createExecutionRoutes({ upstream, workspaceAuth: createWorkspaceAuthorizer() })
    expect(() => createExecutionRoutes({ upstream, workspaceAuth: createWorkspaceAuthorizer() })).toThrow(/already mounted/)
  })

  test('缺 workspaceAuth → 硬错', () => {
    const { bareUpstream } = makeEnv()
    expect(() => createExecutionRoutes({ upstream: bareUpstream(), workspaceAuth: undefined as never })).toThrow(/workspaceAuth authorizer is required/)
  })
})

// HTTP 面（E1 引擎零启动 + probe 连接级鉴权 + fence 生效）——真 server 腿。
function makeHttpHost(execution: boolean) {
  const sessionHost: SessionHost = createSessionHost({ productId: 'atlascode', scopes: [{ scopeId: 'main', storageDir: '/tmp/does-not-matter' }] })
  const auth = createLaunchAuth({ secret: 'test-secret-0123456789abcdef' })
  let executionOpt: Parameters<typeof createHttpHost>[0]['execution']
  if (execution) {
    const ws = createWorkspaceAuthorizer()
    ws.grantWorkspace('ws1', '/tmp/ws1')
    const upstream = createExecutionUpstream({
      actorId: () => 'conn-1',
      workspaceDir: (id) => ws.workspaceDir(id),
      runTurn: async () => 'completed',
    })
    executionOpt = { upstream, workspaceAuth: ws }
  }
  const server = createHttpHost({ sessionHost, auth, ...(executionOpt !== undefined ? { execution: executionOpt } : {}) })
  return new Promise<{ server: typeof server; port: number; cookie: string }>((resolve) => {
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

const hosts: Array<{ close: () => void }> = []
afterAll(() => { hosts.forEach((h) => h.close()) })

describe('httpHost × execution（POST /execution/*）', () => {
  test('E1：未启用 → POST 全 404（零 upstream 构造面）', async () => {
    const { server, port, cookie } = await makeHttpHost(false)
    hosts.push({ close: () => server.close() })
    const r = await fetch(`http://127.0.0.1:${port}/execution/turn.submit`, {
      method: 'POST', headers: { host: `127.0.0.1:${port}`, cookie, 'content-type': 'application/json' },
      body: JSON.stringify(submit),
    })
    expect(r.status).toBe(404)
  })

  test('启用：probe 200 {enabled:true}；fence 仍全局（无 cookie → 401）', async () => {
    const { server, port, cookie } = await makeHttpHost(true)
    hosts.push({ close: () => server.close() })
    const base = `http://127.0.0.1:${port}`
    const probe = await fetch(`${base}/execution/probe`, { method: 'POST', headers: { host: `127.0.0.1:${port}`, cookie } })
    expect(probe.status).toBe(200)
    expect(await probe.json()).toEqual({ enabled: true, supportedV: 0 })
    const noAuth = await fetch(`${base}/execution/probe`, { method: 'POST', headers: { host: `127.0.0.1:${port}` } })
    expect(noAuth.status).toBe(401)
  })

  test('启用：turn.submit 授权工作区 → 200 turn.accepted（全链穿通）', async () => {
    const { server, port, cookie } = await makeHttpHost(true)
    hosts.push({ close: () => server.close() })
    const r = await fetch(`http://127.0.0.1:${port}/execution/turn.submit`, {
      method: 'POST',
      headers: { host: `127.0.0.1:${port}`, cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ ...submit, payload: { submitId: 'e2e-leg-1', text: 'hi' } }),
    })
    expect(r.status).toBe(200)
    expect(((await r.json()) as { type?: string }).type).toBe('turn.accepted')
  })
})
