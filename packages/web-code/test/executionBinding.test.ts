// B 附表 §2 B1 遗留接线腿 —— 组合根 workspace 意图 + web-code 会话维组装。
// 裁定 R1（ledger）：config.execution.binding() = 组合根 workspace 意图
// （`{ workspaceId } | null`——发现列表面候 B3/接线工单，本形仅默认选择最小形）；
// sessionId 维由 web-code 以当前选中会话组装（controller.sessionId = 唯一真源，
// attach 时点读快照，无 URL 回读竞态）。服务端逐命令授权对表不变（E1）。
import { describe, expect, test } from 'bun:test'
import { apply, type WebCodeConfig } from '../src/index.tsx'
import type { ExecutionTransport } from '../src/execution/executionController.ts'

// —— 只读面 stub（root-supply 同形最小集）——

function envelope(payload: Record<string, unknown>): Response {
  return Response.json({
    of: 'webSession', schemaVersion: 0, requestId: 'r', productId: 'atlascode',
    scopeId: 'main', kind: 'response', ...payload,
  })
}

function summary(id: string): Record<string, unknown> {
  return {
    sessionId: id, title: null, createdAt: '2026-11-20T00:00:00Z',
    updatedAt: '2026-11-20T01:00:00Z', messageCount: 1,
    productId: 'atlascode', scopeId: 'main',
  }
}

function sseResponse(frames: unknown[]): Response {
  const encoder = new TextEncoder()
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`))
      controller.close()
    },
  }), { status: 200 })
}

function baseline(sessionId: string): Record<string, unknown> {
  return {
    kind: 'baseline', generation: '11111111-1111-4111-8111-111111111111',
    baselineId: '22222222-2222-4222-8222-222222222222', revision: 1, cursor: 'c0',
    projection: {
      sessionId, productId: 'atlascode', scopeId: 'main',
      semantics: 'persisted-effective-conversation',
      messages: [{ id: 'p1', role: 'user', createdAt: null, blocks: [{ kind: 'text', text: 'seed' }] }],
      truncated: false,
    },
    schemaVersion: 0, productId: 'atlascode', scopeId: 'main', subscriptionId: 'sub1',
  }
}

function stubFetch(): typeof fetch {
  return (async (input: unknown) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url.includes('/sessions?scopeId=')) return envelope({ sessions: [summary('s1'), summary('s2')] })
    const replay = url.match(/\/sessions\/([^/]+)\/replay/)
    if (replay) return envelope({ projection: { sessionId: decodeURIComponent(replay[1]!), productId: 'atlascode', scopeId: 'main', semantics: 'persisted-effective-conversation', messages: [], truncated: false } })
    const follow = url.match(/\/sessions\/([^/]+)\/follow/)
    if (follow) return sseResponse([baseline(decodeURIComponent(follow[1]!))])
    throw new Error(`unexpected fetch: ${url}`)
  }) as typeof fetch
}

function stubCtx() {
  const registrations: Array<Record<string, unknown>> = []
  const services = new Map<string, unknown>()
  const ctx = {
    effect(fn: () => (() => void) | void): () => void { const d = fn(); return () => { void d } },
    slots: {
      provideRoot(): () => void { return () => {} },
      register(options: Record<string, unknown>): () => void { registrations.push(options); return () => {} },
      entries(): unknown[] { return [] },
      subscribe(): () => void { return () => {} },
    },
    reflect: { provide(name: string, service: unknown): unknown { services.set(name, service); return service } },
    on(): () => void { return () => {} },
  }
  return { ctx, registrations, services }
}

// —— 执行 transport stub：记录每次开流的 bind 与 abort ——

interface StreamRecord {
  workspaceId: string
  sessionId: string
  aborted: boolean
}

function fakeExecutionTransport(): ExecutionTransport & { streams: StreamRecord[] } {
  const streams: StreamRecord[] = []
  return {
    streams,
    post: async () => ({ status: 200, body: { enabled: true, supportedV: 0 } }),
    openEventStream: async function* (opts) {
      const rec: StreamRecord = { workspaceId: opts.workspaceId, sessionId: opts.sessionId, aborted: false }
      streams.push(rec)
      opts.signal.addEventListener('abort', () => { rec.aborted = true })
      yield { v: 0, id: `evt-${streams.length}`, ts: 0, type: 'turn.accepted', bind: { workspaceId: opts.workspaceId, sessionId: opts.sessionId, turnId: `t${streams.length}` }, payload: {}, cursor: `c${streams.length}` }
      await new Promise(() => {}) // 挂流至 abort（attach 换绑语义）
    },
  } as never
}

async function waitFor(cond: () => boolean, ms = 2000): Promise<void> {
  const deadline = Date.now() + ms
  while (!cond()) {
    if (Date.now() > deadline) throw new Error('waitFor timeout')
    await new Promise(r => setTimeout(r, 20))
  }
}

interface ConversationServiceStub {
  openSession(id: string): Promise<void>
}

/** 主视图注入面钩子（execution 状态观测口）。 */
function executionHook(registrations: Array<Record<string, unknown>>): { getSnapshot(): { phase: string } } | null {
  const main = registrations.find(r => r.name === 'main') as { inject(): { hooks: { execution?: { getSnapshot(): { phase: string } } } } } | undefined
  return main?.inject().hooks.execution ?? null
}

const baseConfig = (execution?: WebCodeConfig['execution']): WebCodeConfig => ({
  connection: { baseUrl: 'http://stub', credential: 'pre-shared' },
  fetch: stubFetch(),
  ...(execution !== undefined ? { execution } : {}),
})

describe('B1 遗留接线 · 组合根 workspace 意图 + 会话维组装（R1）', () => {
  test('apply 把执行流绑到当前选中会话（sessionId 由 web-code 组装，attach 时点快照）', async () => {
    const { ctx, registrations, services } = stubCtx()
    const transport = fakeExecutionTransport()
    await apply(ctx as never, baseConfig({
      transport,
      binding: () => ({ workspaceId: 'ws-main' }),
    }))
    // 未选会话：组合 = null（sessionId 维缺）→ disabled 零开流。
    expect(executionHook(registrations)).not.toBeNull()
    expect(executionHook(registrations)!.getSnapshot().phase).toBe('disabled')
    expect(transport.streams).toHaveLength(0)

    // 选中 s1：组合绑定 {ws-main, s1} → probe → ready → 开流。
    const controller = services.get('conversation') as ConversationServiceStub
    await controller.openSession('s1')
    await waitFor(() => transport.streams.length >= 1)
    expect(transport.streams[0]).toMatchObject({ workspaceId: 'ws-main', sessionId: 's1' })
    expect(executionHook(registrations)!.getSnapshot().phase).toBe('ready')

    // 切换 s2：新流绑 {ws-main, s2}（attach 换绑；旧流 abort）。
    await controller.openSession('s2')
    await waitFor(() => transport.streams.length >= 2)
    expect(transport.streams[1]).toMatchObject({ workspaceId: 'ws-main', sessionId: 's2' })
    expect(transport.streams[0]!.aborted).toBe(true)
  })

  test('组合根 decline（binding null）→ 会话在场仍 disabled 零开流', async () => {
    const { ctx, registrations, services } = stubCtx()
    const transport = fakeExecutionTransport()
    await apply(ctx as never, baseConfig({
      transport,
      binding: () => null,
    }))
    const controller = services.get('conversation') as ConversationServiceStub
    await controller.openSession('s1')
    await new Promise(r => setTimeout(r, 100))
    expect(executionHook(registrations)!.getSnapshot().phase).toBe('disabled')
    expect(transport.streams).toHaveLength(0)
  })

  test('config 缺 execution → 执行钩子零注入（纯只读回归保持）', async () => {
    const { ctx, registrations } = stubCtx()
    await apply(ctx as never, baseConfig())
    const main = registrations.find(r => r.name === 'main') as { inject(): { hooks: Record<string, unknown> } }
    expect(main.inject().hooks.execution).toBeUndefined()
  })
})

// —— B3 收尾波工单增量①：workspace 发现列表选择 → binding 源 ——
// 选择 ≠ 授权（服务端逐命令 workspaceAuth E1 不变）；hint binding() = 深链回退。

describe('B3 增量① · 列表选择 → executionBinding 源 = 选中项', () => {
  const wsConfig = (transport: ExecutionTransport): WebCodeConfig => baseConfig({
    transport,
    binding: () => null, // 无 hint（深链缺席）
    workspaces: [{ workspaceId: 'ws-a' }, { workspaceId: 'ws-b' }],
  })

  test('腿② 无选择无 hint → binding null → disabled 零开流（写面零渲染回归形）', async () => {
    const { ctx, registrations, services } = stubCtx()
    const transport = fakeExecutionTransport()
    await apply(ctx as never, wsConfig(transport))
    // 列表选择钩子在场（面板可渲染）……
    const main = registrations.find(r => r.name === 'main') as { inject(): { hooks: Record<string, unknown> } }
    expect(main.inject().hooks.workspaceSelection).not.toBeUndefined()
    // ……但未选择 → 组合绑定 null → disabled，执行流零开。
    const controller = services.get('conversation') as ConversationServiceStub
    await controller.openSession('s1')
    await new Promise(r => setTimeout(r, 100))
    expect(executionHook(registrations)!.getSnapshot().phase).toBe('disabled')
    expect(transport.streams).toHaveLength(0)
  })

  test('腿① 列表选择 ws-b → binding 源 = 选中项（hint null 亦生效）', async () => {
    const { ctx, registrations, services } = stubCtx()
    const transport = fakeExecutionTransport()
    await apply(ctx as never, wsConfig(transport))
    const controller = services.get('conversation') as ConversationServiceStub
    await controller.openSession('s1')
    await new Promise(r => setTimeout(r, 100))
    expect(executionHook(registrations)!.getSnapshot().phase).toBe('disabled')
    // 经主视图注入钩子选择（面板 onSelect 同一 store 写入口）：
    const main = registrations.find(r => r.name === 'main') as { inject(): { hooks: { workspaceSelection: { select(id: string): void } } } }
    main.inject().hooks.workspaceSelection.select('ws-b')
    await waitFor(() => transport.streams.length >= 1)
    expect(transport.streams[0]).toMatchObject({ workspaceId: 'ws-b', sessionId: 's1' })
    expect(executionHook(registrations)!.getSnapshot().phase).toBe('ready')
  })

  test('选中项优先于 hint（深链回退仅在未选择时消费）', async () => {
    const { ctx, registrations, services } = stubCtx()
    const transport = fakeExecutionTransport()
    await apply(ctx as never, baseConfig({
      transport,
      binding: () => ({ workspaceId: 'ws-hint' }), // hint 在场
      workspaces: [{ workspaceId: 'ws-a' }],
    }))
    const controller = services.get('conversation') as ConversationServiceStub
    await controller.openSession('s1')
    await waitFor(() => transport.streams.length >= 1)
    expect(transport.streams[0]!.workspaceId).toBe('ws-hint') // 未选择 → hint 回退
    // 选择后覆盖 hint：换绑新流至选中项。
    const main = registrations.find(r => r.name === 'main') as { inject(): { hooks: { workspaceSelection: { select(id: string): void } } } }
    main.inject().hooks.workspaceSelection.select('ws-a')
    await waitFor(() => transport.streams.length >= 2)
    expect(transport.streams[1]).toMatchObject({ workspaceId: 'ws-a', sessionId: 's1' })
  })

  test('config 缺 workspaces → workspaceSelection 钩子零注入（回归形）', async () => {
    const { ctx, registrations } = stubCtx()
    const transport = fakeExecutionTransport()
    await apply(ctx as never, baseConfig({ transport, binding: () => ({ workspaceId: 'ws-main' }) }))
    const main = registrations.find(r => r.name === 'main') as { inject(): { hooks: Record<string, unknown> } }
    expect(main.inject().hooks.workspaceSelection).toBeUndefined()
  })
})
