// B 附表 §3 RED/GREEN：执行通道控制器单测（fake transport，零网络）。
// 对表工单 §3 判据面：queue.remove=cancelled 终态语义由投影承接 / decide
// bind≡归属 turn（turn-exact）/ 事件 id 恰一次 / cursor 续传 / probe off
// 零派发。行为判据以 e2e 真 server 立判（B1 先例：本单测是接线见证）。
import { describe, expect, test } from 'bun:test'
import { ExecutionController,
  type ExecutionBinding, type ExecutionStatusModel, type ExecutionTransport } from '../src/execution/executionController.ts'

const BINDING: ExecutionBinding = { workspaceId: 'ws1', sessionId: 'sess1' }

let uuidCounter = 0
const uuid = (): string => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, '0')}`

const event = (type: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({
  type,
  id: uuid(),
  cursor: uuid(),
  v: 0,
  ts: 1_700_000_000_000,
  bind: { workspaceId: 'ws1', sessionId: 'sess1', turnId: 'turn-1' },
  payload: {},
  ...over,
})

class FakeTransport implements ExecutionTransport {
  posts: Array<{ path: string; body: Record<string, unknown> }> = []
  streams: Array<{ workspaceId: string; sessionId: string; cursor?: string }> = []
  /** probe 响应体（缺省 on）。 */
  probeBody: unknown = { enabled: true, supportedV: 0 }
  probeStatus = 200
  /** 事件流帧序列（按 openEventStream 调用序取用；缺省空流）。 */
  frames: unknown[][] = []

  async post(path: string, body: unknown): Promise<{ status: number; body: unknown }> {
    this.posts.push({ path, body: body as Record<string, unknown> })
    if (path === '/execution/probe') return { status: this.probeStatus, body: this.probeBody }
    return { status: 200, body: { type: 'turn.accepted', id: uuid(), cursor: uuid(), v: 0, ts: 0, bind: {}, payload: {} } }
  }

  openEventStream(opts: { workspaceId: string; sessionId: string; cursor?: string; signal: AbortSignal }): AsyncIterable<unknown> {
    this.streams.push({ workspaceId: opts.workspaceId, sessionId: opts.sessionId, ...(opts.cursor !== undefined ? { cursor: opts.cursor } : {}) })
    const frames = this.frames.shift() ?? []
    return (async function* () {
      for (const frame of frames) yield frame
    })()
  }
}

function makeController(transport = new FakeTransport(), binding: ExecutionBinding | null = BINDING) {
  const controller = new ExecutionController(transport, { binding: () => binding })
  return { controller, transport }
}

const waitFor = async (read: () => boolean, timeoutMs = 2000): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  while (!read()) {
    if (Date.now() > deadline) throw new Error('waitFor timeout')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

describe('ExecutionController · probe gate', () => {
  test('无绑定 → attach 后 disabled，零派发', async () => {
    const { controller, transport } = makeController(new FakeTransport(), null)
    await controller.attach()
    expect(controller.status.getSnapshot().phase).toBe('disabled')
    expect(transport.posts.length).toBe(0)
  })

  test('probe off → disabled（零渲染语义源）', async () => {
    const transport = new FakeTransport()
    transport.probeBody = { enabled: false, supportedV: 0 }
    const { controller } = makeController(transport)
    await controller.attach()
    expect(controller.status.getSnapshot().phase).toBe('disabled')
  })

  test('probe 非 200 → error；probe on → ready 并开流（带绑定、首连无 cursor）', async () => {
    const failing = new FakeTransport()
    failing.probeStatus = 500
    const a = makeController(failing)
    await a.controller.attach()
    expect(a.controller.status.getSnapshot().phase).toBe('error')

    const { controller, transport } = makeController()
    await controller.attach()
    expect(controller.status.getSnapshot().phase).toBe('ready')
    expect(transport.streams.length).toBe(1)
    expect(transport.streams[0]).toEqual({ workspaceId: 'ws1', sessionId: 'sess1' })
  })

  test('未 ready 时命令面硬错（零派发）', async () => {
    const { controller, transport } = makeController()
    await expect(controller.submit('hi')).rejects.toThrow(/not ready/)
    await expect(controller.decide('a', 'approved')).rejects.toThrow(/not ready/)
    expect(transport.posts.length).toBe(0)
  })
})

describe('ExecutionController · 四写命令 wire 形', () => {
  test('submit：v0 信封 + UUID submitId；reuse 复用同 id（E3 幂等重试）', async () => {
    const { controller, transport } = makeController()
    await controller.attach()
    const first = await controller.submit('你好')
    const retry = await controller.submit('你好', { reuseLastSubmitId: true })
    expect(retry.submitId).toBe(first.submitId)
    const submits = transport.posts.filter(p => p.path === '/execution/turn.submit')
    expect(submits.length).toBe(2)
    for (const s of submits) {
      expect(s.body.type).toBe('turn.submit')
      expect(s.body.v).toBe(0)
      expect(s.body.bind).toEqual({ workspaceId: 'ws1', sessionId: 'sess1' })
      expect((s.body.payload as Record<string, unknown>).submitId).toBe(first.submitId)
      expect((s.body.payload as Record<string, unknown>).text).toBe('你好')
    }
    // 非 reuse 的 submit 产新 id
    const second = await controller.submit('again')
    expect(second.submitId).not.toBe(first.submitId)
  })

  test('cancel / remove：payload.targetTurnId；remove 走 queue.remove（kernel 落 cancelled 终态）', async () => {
    const { controller, transport } = makeController()
    await controller.attach()
    await controller.cancel('turn-9')
    await controller.remove('turn-9')
    const cancel = transport.posts.find(p => p.path === '/execution/turn.cancel')
    const remove = transport.posts.find(p => p.path === '/execution/queue.remove')
    expect((cancel!.body.payload as Record<string, unknown>).targetTurnId).toBe('turn-9')
    expect((remove!.body.payload as Record<string, unknown>).targetTurnId).toBe('turn-9')
    expect(remove!.body.type).toBe('queue.remove')
  })

  test('decide：bind.turnId ≡ approval.requested 归属 turn（turn-exact）；未知 approvalId 零派发', async () => {
    const transport = new FakeTransport()
    transport.frames.push([
      event('turn.accepted', { bind: { workspaceId: 'ws1', sessionId: 'sess1', turnId: 'turn-A' } }),
      event('approval.requested', { bind: { workspaceId: 'ws1', sessionId: 'sess1', turnId: 'turn-A' }, payload: { approvalId: 'ap-1' } }),
    ])
    const { controller } = makeController(transport)
    await controller.attach()
    await waitFor(() => controller.status.getSnapshot().pendingApprovals.length === 1)

    await controller.decide('ap-1', 'denied')
    const decide = transport.posts.find(p => p.path === '/execution/approval.decide')
    expect(decide).toBeDefined()
    expect(decide!.body.type).toBe('approval.decide')
    expect(decide!.body.bind).toEqual({ workspaceId: 'ws1', sessionId: 'sess1', turnId: 'turn-A' })
    expect(decide!.body.payload).toEqual({ approvalId: 'ap-1', decision: 'denied' })

    await expect(controller.decide('ap-unknown', 'approved')).rejects.toThrow(/not pending/)
    expect(transport.posts.filter(p => p.path === '/execution/approval.decide').length).toBe(1)
  })
})

describe('ExecutionController · 事件投影', () => {
  test('队列投影：accepted 入队 → started 出队占 running → 终态清位', async () => {
    const transport = new FakeTransport()
    transport.frames.push([
      event('turn.accepted', { bind: { workspaceId: 'ws1', sessionId: 'sess1', turnId: 't1' } }),
      event('turn.accepted', { bind: { workspaceId: 'ws1', sessionId: 'sess1', turnId: 't2' } }),
      event('turn.started', { bind: { workspaceId: 'ws1', sessionId: 'sess1', turnId: 't1' } }),
      event('turn.cancelled', { bind: { workspaceId: 'ws1', sessionId: 'sess1', turnId: 't1' } }),
    ])
    const { controller } = makeController(transport)
    await controller.attach()
    await waitFor(() => controller.status.getSnapshot().queue.runningTurnId === null && controller.status.getSnapshot().queue.queuedTurnIds.length === 1)
    const s1 = controller.status.getSnapshot()
    expect(s1.queue.queuedTurnIds).toEqual(['t2'])

    transport.frames.push([
      event('turn.started', { bind: { workspaceId: 'ws1', sessionId: 'sess1', turnId: 't2' } }),
      event('turn.completed', { bind: { workspaceId: 'ws1', sessionId: 'sess1', turnId: 't2' } }),
    ])
    await controller.reconnect()
    await waitFor(() => controller.status.getSnapshot().queue.runningTurnId === null && controller.status.getSnapshot().queue.queuedTurnIds.length === 0)
  })

  test('settled：pending 摘除 + settled 列表（actorId/timestamp 取自事件，不本地推断）', async () => {
    const transport = new FakeTransport()
    transport.frames.push([
      event('approval.requested', { bind: { workspaceId: 'ws1', sessionId: 'sess1', turnId: 'turn-A' }, payload: { approvalId: 'ap-1' } }),
      event('approval.settled', {
        bind: { workspaceId: 'ws1', sessionId: 'sess1', turnId: 'turn-A' },
        payload: { approvalId: 'ap-1', decision: 'approved', actorId: 'conn-1', timestamp: 1_700_000_000_000 },
      }),
    ])
    const { controller } = makeController(transport)
    await controller.attach()
    await waitFor(() => controller.status.getSnapshot().settledApprovals.length === 1)
    const s = controller.status.getSnapshot()
    expect(s.pendingApprovals).toEqual([])
    expect(s.settledApprovals[0]).toEqual({ approvalId: 'ap-1', turnId: 'turn-A', decision: 'approved', actorId: 'conn-1', timestamp: 1_700_000_000_000 })
  })

  test('恰一次：同 id 事件零重复消费；异绑定事件零消费；queue.updated 不消费', async () => {
    const transport = new FakeTransport()
    const shared = event('turn.accepted', { bind: { workspaceId: 'ws1', sessionId: 'sess1', turnId: 't1' } })
    transport.frames.push([
      shared,
      shared, // 同 id 重放
      event('turn.accepted', { bind: { workspaceId: 'other', sessionId: 'sess1', turnId: 'tX' } }), // 异绑定
      event('queue.updated', { payload: { depth: 3 } }),
    ])
    const { controller } = makeController(transport)
    await controller.attach()
    await waitFor(() => controller.status.getSnapshot().queue.queuedTurnIds.length === 1)
    expect(controller.status.getSnapshot().queue.queuedTurnIds).toEqual(['t1'])
  })

  test('replay 三态帧：delta 帧事件应用 + headCursor 记录；reconnect 以 lastCursor 续传', async () => {
    const transport = new FakeTransport()
    transport.frames.push([
      { kind: 'delta', events: [event('turn.accepted', { bind: { workspaceId: 'ws1', sessionId: 'sess1', turnId: 't1' } })], headCursor: 'c-head' },
    ])
    const { controller, transport: t } = makeController(transport)
    await controller.attach()
    await waitFor(() => controller.status.getSnapshot().lastCursor === 'c-head')
    controller.reconnect()
    await waitFor(() => t.streams.length === 2)
    expect(t.streams[1]!.cursor).toBe('c-head')
  })

  test('空基线帧（kind=baseline events=[]）：零事件 + headCursor 记录', async () => {
    const transport = new FakeTransport()
    transport.frames.push([{ kind: 'baseline', events: [], headCursor: 'c0' }])
    const { controller } = makeController(transport)
    await controller.attach()
    await waitFor(() => controller.status.getSnapshot().lastCursor === 'c0')
    expect(controller.status.getSnapshot().queue.queuedTurnIds).toEqual([])
  })
})
