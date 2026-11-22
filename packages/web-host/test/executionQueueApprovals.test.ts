import { describe, test, expect, afterAll } from 'bun:test'
import { createQueueProjection } from '../src/execution/queue'
import { createApprovalEvidenceStore } from '../src/execution/approvals'
import { createExecutionRoutes } from '../src/execution/executionRoutes'
import { createExecutionUpstream } from '../src/execution/upstream'
import type { ExecutionTurnRunnerDeps } from '@atlaswork/atlascode/web-session-runtime/execution'
import { createWorkspaceAuthorizer } from '../src/execution/workspaceAuth'
import { createHttpHost } from '../src/httpHost'
import { createLaunchAuth } from '../src/auth'
import { createSessionHost, type SessionHost } from '../src/sessionHost'

const uuid = (): string => crypto.randomUUID()
const ev = (type: string, bind: Record<string, string>, payload: Record<string, unknown> = {}): never => ({
  v: 0,
  type,
  id: uuid(),
  ts: Date.now(),
  cursor: `${Date.now()}-${Math.random()}`,
  bind,
  payload,
}) as never

describe('queue projection（B2 §3：纯投影，FIFO 视图）', () => {
  test('accepted→入队 / started→running / 终态→出列清位', () => {
    const q = createQueueProjection()
    const b = (turnId: string): Record<string, string> => ({ workspaceId: 'ws1', sessionId: 's1', turnId })
    q.apply(ev('turn.accepted', b('t1'), { submitId: 'a' }))
    q.apply(ev('turn.accepted', b('t2'), { submitId: 'b' }))
    expect(q.snapshot('ws1', 's1')).toMatchObject({ runningTurnId: null, queuedTurnIds: ['t1', 't2'], capacity: 16 })
    q.apply(ev('turn.started', b('t1')))
    expect(q.snapshot('ws1', 's1')).toMatchObject({ runningTurnId: 't1', queuedTurnIds: ['t2'] })
    q.apply(ev('turn.completed', b('t1')))
    expect(q.snapshot('ws1', 's1')).toMatchObject({ runningTurnId: null, queuedTurnIds: ['t2'] })
    q.apply(ev('turn.cancelled', b('t2')))
    expect(q.snapshot('ws1', 's1').queuedTurnIds).toEqual([])
  })

  test('幂等：重复 accepted / 重复终态零第二效果；bind 非法忽略', () => {
    const q = createQueueProjection()
    const b = { workspaceId: 'ws1', sessionId: 's1', turnId: 't1' }
    q.apply(ev('turn.accepted', b))
    q.apply(ev('turn.accepted', b))
    expect(q.snapshot('ws1', 's1').queuedTurnIds).toEqual(['t1'])
    q.apply(ev('turn.started', b))
    q.apply(ev('turn.completed', b))
    q.apply(ev('turn.completed', b))
    expect(q.snapshot('ws1', 's1')).toMatchObject({ runningTurnId: null, queuedTurnIds: [] })
    q.apply(ev('turn.accepted', { workspaceId: '', sessionId: 's1', turnId: 'x' }))
    expect(q.snapshot('', 's1').queuedTurnIds).toEqual([])
  })

  test('会话隔离：不同 session / workspace 状态不串', () => {
    const q = createQueueProjection()
    q.apply(ev('turn.accepted', { workspaceId: 'ws1', sessionId: 's1', turnId: 't1' }))
    q.apply(ev('turn.accepted', { workspaceId: 'ws1', sessionId: 's2', turnId: 't2' }))
    expect(q.snapshot('ws1', 's1').queuedTurnIds).toEqual(['t1'])
    expect(q.snapshot('ws1', 's2').queuedTurnIds).toEqual(['t2'])
    expect(q.snapshot('ws2', 's1').queuedTurnIds).toEqual([])
  })
})

describe('approval evidence（B2 §3：七字段纯落档，不自裁）', () => {
  const settled = (over: Record<string, unknown> = {}): never => ev('approval.settled',
    { workspaceId: 'ws1', sessionId: 's1', turnId: 't1' },
    { approvalId: 'ap1', decision: 'approved', actorId: 'conn-1', timestamp: 1700000000000, ...over })

  test('恰好七字段：正文/令牌/待批内容零入档', () => {
    const store = createApprovalEvidenceStore()
    store.apply(settled({ text: 'secret body', token: 'tok', content: 'pending' }))
    const rows = store.query('ws1')
    expect(rows).toEqual([{
      workspaceId: 'ws1', sessionId: 's1', turnId: 't1', approvalId: 'ap1',
      decision: 'approved', actorId: 'conn-1', timestamp: 1700000000000,
    }])
    expect(Object.keys(rows[0]!).sort()).toEqual(['actorId', 'approvalId', 'decision', 'sessionId', 'timestamp', 'turnId', 'workspaceId'])
  })

  test('缺失字段 / 非法决策 → 零记录（fail-closed 不落半证）', () => {
    const store = createApprovalEvidenceStore()
    store.apply(settled({ actorId: undefined }))
    store.apply(settled({ decision: 'maybe' }))
    store.apply(settled({ timestamp: 'now' }))
    expect(store.query('ws1')).toEqual([])
    store.apply(ev('approval.requested', { workspaceId: 'ws1', sessionId: 's1', turnId: 't1' }, { approvalId: 'ap2' }))
    expect(store.query('ws1')).toEqual([])
  })

  test('有效决定恰一个：同 approvalId 二次 settled 忽略（首条为准）', () => {
    const store = createApprovalEvidenceStore()
    store.apply(settled())
    store.apply(settled({ decision: 'denied', actorId: 'conn-2' }))
    const rows = store.query('ws1')
    expect(rows.length).toBe(1)
    expect(rows[0]!.decision).toBe('approved')
    expect(rows[0]!.actorId).toBe('conn-1')
  })

  test('服务端查询限定本 workspace（越域读零路径）+ session/turn 过滤', () => {
    const store = createApprovalEvidenceStore()
    store.apply(settled())
    store.apply(settled({ approvalId: 'ap2', decision: 'denied' }))
    store.apply(ev('approval.settled', { workspaceId: 'ws2', sessionId: 's9', turnId: 't9' },
      { approvalId: 'ap9', decision: 'approved', actorId: 'conn-9', timestamp: 1 }))
    expect(store.query('ws2').length).toBe(1)
    expect(store.query('ws1').length).toBe(2)
    expect(store.query('ws1', { sessionId: 's9' })).toEqual([])
    expect(store.query('ws1', { turnId: 't1' }).length).toBe(2)
    expect(store.query('ws1', { turnId: 'nope' })).toEqual([])
  })

  test('保留期限 = turn 同生命周期：dropTurn 精确删除该 turn 记录', () => {
    const store = createApprovalEvidenceStore()
    store.apply(settled())
    store.apply(settled({ approvalId: 'ap2' }))
    store.apply(ev('approval.settled', { workspaceId: 'ws1', sessionId: 's1', turnId: 't2' },
      { approvalId: 'ap3', decision: 'approved', actorId: 'conn-1', timestamp: 2 }))
    expect(store.dropTurn('ws1', 's1', 't1')).toBe(2)
    expect(store.query('ws1').map(r => r.turnId)).toEqual(['t2'])
  })
})

// 内核驱动的真事件链（fake runTurn：等待 requestApproval → 决策映射终态）——
// 复用 B1 bareUpstream 工厂形：每个场景独立 upstream 实例（§7 WeakSet 守卫）。
function makeKernelEnv(hook?: (deps: ExecutionTurnRunnerDeps) => void) {
  const auth = createWorkspaceAuthorizer()
  auth.grantWorkspace('ws1', '/tmp/ws1')
  const upstream = createExecutionUpstream({
    actorId: () => 'conn-1',
    workspaceDir: (id) => auth.workspaceDir(id),
    now: () => 1_700_000_000_000,
    runTurn: async (deps) => {
      hook?.(deps)
      const decision = await deps.requestApproval()
      return decision === 'approved' ? 'completed' : 'cancelled'
    },
  })
  const routes = createExecutionRoutes({ upstream, workspaceAuth: auth })
  return { auth, upstream, routes }
}

const submit = (submitId = uuid()): Record<string, unknown> => ({
  v: 0, type: 'turn.submit', id: uuid(), ts: Date.now(),
  bind: { workspaceId: 'ws1', sessionId: 's1', turnId: '' },
  payload: { submitId, text: 'hi' },
})

const waitFor = async <T>(read: () => T | undefined, timeoutMs = 2000): Promise<T> => {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const value = read()
    if (value !== undefined) return value
    await new Promise(r => setTimeout(r, 5))
  }
  throw new Error('waitFor timeout')
}

describe('executionRoutes B2 面 · 事件单 tap + 队列/证据/回放', () => {
  test('dispatch 后：队列投影可见、订阅者收到、replay delta 可续', async () => {
    const { routes } = makeKernelEnv()
    const events: Array<{ type?: string; id?: string }> = []
    const off = routes.subscribe(e => events.push(e as never))
    const r = await routes.dispatch(submit() as never)
    expect(r.status).toBe(200)
    expect((r.body as { type?: string }).type).toBe('turn.accepted')
    // kernel 直启（并发 1）：accepted 即入队、started 即出队 → running 槽持有。
    const running = routes.queueSnapshot('ws1', 's1')
    expect(running.runningTurnId).toBe((r.body as { bind: { turnId: string } }).bind.turnId)
    expect(running.queuedTurnIds).toEqual([])
    expect(events.some(e => e.type === 'turn.accepted')).toBe(true) // 单 tap 扇出
    const cursor = (events[0] as { cursor?: string }).cursor!
    const replay = routes.replay('ws1', 's1', cursor)
    expect(replay.kind).toBe('delta')
    expect(replay.events.length).toBeGreaterThanOrEqual(1)
    off()
    const before = events.length
    await routes.dispatch({ ...submit(), payload: { submitId: uuid(), text: 'x' } } as never)
    expect(events.length).toBe(before)
    routes.dispose()
  })

  test('审批全链：requested → decide(approved) → settled 证据七字段（actorId/时钟服务端产）', async () => {
    const { routes } = makeKernelEnv()
    const seen: Array<Record<string, unknown>> = []
    const off = routes.subscribe(e => seen.push(e as never))
    const accepted = await routes.dispatch(submit() as never)
    expect((accepted.body as { type?: string }).type).toBe('turn.accepted')
    const turnId = (accepted.body as { bind: { turnId: string } }).bind.turnId
    const requested = await waitFor(() => seen.find(e => e.type === 'approval.requested'))
    const approvalId = (requested.payload as { approvalId: string }).approvalId
    const decided = await routes.dispatch({
      v: 0, type: 'approval.decide', id: uuid(), ts: Date.now(),
      bind: { workspaceId: 'ws1', sessionId: 's1', turnId },
      payload: { approvalId, decision: 'approved' },
    } as never)
    expect(decided.status).toBe(200)
    expect(routes.approvalEvidence('ws1', { turnId })).toEqual([{
      workspaceId: 'ws1', sessionId: 's1', turnId, approvalId,
      decision: 'approved', actorId: 'conn-1', timestamp: 1_700_000_000_000,
    }])
    expect(routes.approvalEvidence('ws1')).toEqual(routes.approvalEvidence('ws1', { turnId }))
    expect(routes.approvalEvidence('ws2')).toEqual([]) // 跨域零路径
    off()
    routes.dispose()
  })

  test('跨 turn decide → 403 approvalBindMismatch 且零证据新增（turn-exact）', async () => {
    const { routes } = makeKernelEnv()
    const seen: Array<Record<string, unknown>> = []
    const off = routes.subscribe(e => seen.push(e as never))
    const accepted = await routes.dispatch(submit() as never)
    const turnId = (accepted.body as { bind: { turnId: string } }).bind.turnId
    await waitFor(() => seen.find(e => e.type === 'approval.requested'))
    const req = seen.find(e => e.type === 'approval.requested')!
    const approvalId = (req.payload as { approvalId: string }).approvalId
    const wrong = await routes.dispatch({
      v: 0, type: 'approval.decide', id: uuid(), ts: Date.now(),
      bind: { workspaceId: 'ws1', sessionId: 's1', turnId: uuid() },
      payload: { approvalId, decision: 'approved' },
    } as never)
    expect(wrong.status).toBe(403)
    expect((wrong.body as { code?: string }).code).toBe('approvalBindMismatch')
    expect(routes.approvalEvidence('ws1')).toEqual([])
    // 正确绑定的决定仍可达 → 证据恰一条
    const right = await routes.dispatch({
      v: 0, type: 'approval.decide', id: uuid(), ts: Date.now(),
      bind: { workspaceId: 'ws1', sessionId: 's1', turnId },
      payload: { approvalId, decision: 'approved' },
    } as never)
    expect(right.status).toBe(200)
    expect(routes.approvalEvidence('ws1').length).toBe(1)
    off()
    routes.dispose()
  })

  test('queue.remove ≡ cancelled 终态（不静默移除）+ 取消后不启动', async () => {
    const { routes } = makeKernelEnv()
    const first = await routes.dispatch(submit() as never)
    const firstTurn = (first.body as { bind: { turnId: string } }).bind.turnId
    const second = await routes.dispatch(submit() as never)
    const secondTurn = (second.body as { bind: { turnId: string } }).bind.turnId
    // 深度：首个 running（fake runTurn 待批），第二个 queued
    expect(routes.queueSnapshot('ws1', 's1').runningTurnId).toBe(firstTurn)
    expect(routes.queueSnapshot('ws1', 's1').queuedTurnIds).toEqual([secondTurn])
    const removed = await routes.dispatch({
      v: 0, type: 'queue.remove', id: uuid(), ts: Date.now(),
      bind: { workspaceId: 'ws1', sessionId: 's1', turnId: secondTurn },
      payload: { targetTurnId: secondTurn },
    } as never)
    expect(removed.status).toBe(200)
    expect((removed.body as { type?: string }).type).toBe('turn.cancelled')
    expect(routes.queueSnapshot('ws1', 's1').queuedTurnIds).toEqual([])
    routes.dispose()
  })
})

// ---- HTTP 面（真 server；GET 查询 + SSE 执行流）-------------------------------
interface HostHandle { server: ReturnType<typeof createHttpHost>; port: number; cookie: string; auth: ReturnType<typeof createLaunchAuth> }

function makeHttpHost(withExecution = true): Promise<HostHandle> {
  const sessionHost: SessionHost = createSessionHost({ productId: 'atlascode', scopes: [{ scopeId: 'main', storageDir: '/tmp/does-not-matter' }] })
  const auth = createLaunchAuth({ secret: 'test-secret-0123456789abcdef' })
  let executionOpt: Parameters<typeof createHttpHost>[0]['execution']
  if (withExecution) {
    const ws = createWorkspaceAuthorizer()
    ws.grantWorkspace('ws1', '/tmp/ws1')
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
        resolve({ server, port, cookie: setCookie.split(';')[0] ?? '', auth })
      })
    })
  })
}

const hosts: Array<{ close: () => void }> = []
afterAll(() => { hosts.forEach((h) => h.close()) })

async function post(base: string, port: number, cookie: string, body: unknown): Promise<Response> {
  return fetch(`${base}/execution/turn.submit`, {
    method: 'POST', headers: { host: `127.0.0.1:${port}`, cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('httpHost × execution B2 GET 面', () => {
  test('未启用 → GET /execution/* 全 404（E1 零构造）', async () => {
    const h = await makeHttpHost(false)
    hosts.push({ close: () => h.server.close() })
    const r = await fetch(`http://127.0.0.1:${h.port}/execution/queue?workspaceId=ws1&sessionId=s1`, { headers: { host: `127.0.0.1:${h.port}`, cookie: h.cookie } })
    expect(r.status).toBe(404)
  })

  test('未授权 workspace → 403（队列/证据/事件三面一致）；缺参 400', async () => {
    const h = await makeHttpHost()
    hosts.push({ close: () => h.server.close() })
    const base = `http://127.0.0.1:${h.port}`
    const headers = { host: `127.0.0.1:${h.port}`, cookie: h.cookie }
    expect((await fetch(`${base}/execution/queue?workspaceId=nope&sessionId=s1`, { headers })).status).toBe(403)
    expect((await fetch(`${base}/execution/approvals?workspaceId=nope`, { headers })).status).toBe(403)
    expect((await fetch(`${base}/execution/events?workspaceId=nope&sessionId=s1`, { headers })).status).toBe(403)
    expect((await fetch(`${base}/execution/queue?workspaceId=ws1`, { headers })).status).toBe(400)
    expect((await fetch(`${base}/execution/events?workspaceId=ws1`, { headers })).status).toBe(400)
  })

  test('POST submit → GET queue 投影；decide → GET approvals 证据可查（服务端产 actorId/时间）', async () => {
    const h = await makeHttpHost()
    hosts.push({ close: () => h.server.close() })
    const base = `http://127.0.0.1:${h.port}`
    const headers = { host: `127.0.0.1:${h.port}`, cookie: h.cookie }
    const sub = await post(base, h.port, h.cookie, submit())
    expect(sub.status).toBe(200)
    const accepted = await sub.json() as { bind: { turnId: string }; cursor: string }
    const turnId = accepted.bind.turnId
    const q = await fetch(`${base}/execution/queue?workspaceId=ws1&sessionId=s1`, { headers })
    expect(((await q.json()) as { runningTurnId: string }).runningTurnId).toBe(turnId)

    // 取 approvalId：以 accepted.cursor 重连 → replay delta 帧内含
    // approval.requested（初始基线为空基线语义，Δ 由 cursor 续传取）
    const ac = new AbortController()
    const stream = await fetch(`${base}/execution/events?workspaceId=ws1&sessionId=s1&cursor=${encodeURIComponent(accepted.cursor)}`, { headers, signal: ac.signal })
    expect(stream.status).toBe(200)
    expect(stream.headers.get('content-type')).toContain('text/event-stream')
    const reader = stream.body!.getReader()
    const decoder = new TextDecoder()
    const frames: Array<Record<string, unknown>> = []
    const deadline = Date.now() + 3000
    while (Date.now() < deadline && !frames.some(f => typeof f.headCursor === 'string')) {
      const { value, done } = await reader.read()
      if (done) break
      for (const block of decoder.decode(value).split('\n\n')) {
        const line = block.trim()
        if (line.startsWith('data: ')) frames.push(JSON.parse(line.slice(6)) as never)
      }
    }
    const replay = frames.find(f => typeof f.headCursor === 'string') as { events: Array<{ type: string; payload: { approvalId?: string } }> }
    const requested = replay.events.find(e => e.type === 'approval.requested')!
    const approvalId = requested.payload.approvalId!
    ac.abort()
    await reader.cancel().catch(() => {})

    const decide = await fetch(`${base}/execution/approval.decide`, {
      method: 'POST', headers: { host: `127.0.0.1:${h.port}`, cookie: h.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        v: 0, type: 'approval.decide', id: uuid(), ts: Date.now(),
        bind: { workspaceId: 'ws1', sessionId: 's1', turnId },
        payload: { approvalId, decision: 'approved' },
      }),
    })
    expect(decide.status).toBe(200)
    const evr = await fetch(`${base}/execution/approvals?workspaceId=ws1&turnId=${turnId}`, { headers })
    const evidence = await evr.json() as { entries: Array<Record<string, unknown>> }
    expect(evidence.entries).toEqual([{
      workspaceId: 'ws1', sessionId: 's1', turnId, approvalId,
      decision: 'approved', actorId: 'conn-1', timestamp: 1_700_000_000_000,
    }])
  })

  test('SSE 带 cursor 重连 → replay delta 帧 + 断线期间事件恰一次可见', async () => {
    const h = await makeHttpHost()
    hosts.push({ close: () => h.server.close() })
    const base = `http://127.0.0.1:${h.port}`
    const headers = { host: `127.0.0.1:${h.port}`, cookie: h.cookie }
    const sub = await post(base, h.port, h.cookie, submit())
    const accepted = await sub.json() as { bind: { turnId: string }; cursor: string }
    // 断线期间：回合完成（fake runTurn 待批 → 取消模拟为 turn.cancel）
    await fetch(`${base}/execution/turn.cancel`, {
      method: 'POST', headers: { host: `127.0.0.1:${h.port}`, cookie: h.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        v: 0, type: 'turn.cancel', id: uuid(), ts: Date.now(),
        bind: { workspaceId: 'ws1', sessionId: 's1', turnId: accepted.bind.turnId },
        payload: { targetTurnId: accepted.bind.turnId },
      }),
    })
    const ac = new AbortController()
    const stream = await fetch(`${base}/execution/events?workspaceId=ws1&sessionId=s1&cursor=${encodeURIComponent(accepted.cursor)}`, { headers, signal: ac.signal })
    const reader = stream.body!.getReader()
    const decoder = new TextDecoder()
    const frames: Array<Record<string, unknown>> = []
    const deadline = Date.now() + 3000
    while (Date.now() < deadline && !frames.some(f => typeof f.headCursor === 'string')) {
      const { value, done } = await reader.read()
      if (done) break
      for (const block of decoder.decode(value).split('\n\n')) {
        const line = block.trim()
        if (line.startsWith('data: ')) frames.push(JSON.parse(line.slice(6)) as never)
      }
    }
    ac.abort()
    await reader.cancel().catch(() => {})
    const replay = frames.find(f => typeof f.headCursor === 'string') as { kind: string; events: Array<{ type: string; id: string }> }
    expect(replay.kind).toBe('delta')
    const cancelled = replay.events.filter(e => e.type === 'turn.cancelled')
    expect(cancelled.length).toBe(1) // 断线期间完成的事件恰一次可见
    const ids = replay.events.map(e => e.id)
    expect(new Set(ids).size).toBe(ids.length) // 无重复投递
  })
})