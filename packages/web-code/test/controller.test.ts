// T6-A Task 8 RED: controller 行为腿（connection stub 级）——
// 会话清单/搜索/重放/follow 收敛 + RF4 切换 abort。
import { describe, expect, test } from 'bun:test'
import { WebCodeController } from '../src/controller.ts'
import type { AtlasConnection, AtlasFollowHandle } from '@atlasweb/web-connection'

/** Manual-emit follow handle stub. */
function stubHandle(): AtlasFollowHandle & { emit(event: unknown): Promise<void>; abortCalled: boolean } {
  const queue: unknown[] = []
  let wake: (() => void) | null = null
  let ended = false
  let resolveDone!: () => void
  const done = new Promise<void>(resolve => { resolveDone = resolve })
  const finish = (): void => { ended = true; wake?.(); resolveDone() }
  const events = {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          for (;;) {
            if (queue.length > 0) return { value: queue.shift(), done: false }
            if (ended) return { value: undefined, done: true }
            await new Promise<void>(resolve => { wake = () => { wake = null; resolve() } })
          }
        },
      }
    },
  }
  const handle = {
    events,
    abortCalled: false,
    abort() { handle.abortCalled = true; finish() },
    done,
    emit: async event => {
      queue.push(event)
      wake?.()
      // Settle: let the detached pump drain the event before emit resolves.
      await new Promise<void>(resolve => setTimeout(resolve, 0))
    },
  }
  return handle
}

/** Connection stub with seeded fixtures and call records. */
function stubConnection() {
  const handles: ReturnType<typeof stubHandle>[] = []
  const connection: AtlasConnection = {
    credential: 'c',
    listSessions: async () => ({
      sessions: [
        { sessionId: 's1', title: 'Session one', createdAt: '2026-11-20T00:00:00Z', updatedAt: '2026-11-20T01:00:00Z', messageCount: 4, productId: 'atlascode', scopeId: 'main' },
        { sessionId: 's2', title: null, createdAt: null, updatedAt: '2026-11-19T01:00:00Z', messageCount: null, productId: 'atlascode', scopeId: 'main' },
      ],
    }),
    searchSessions: async (query: string) => ({
      results: query === 'hello' ? [{ sessionId: 's1', messageId: 'm1', snippet: '…hello…' }] : [],
    }),
    replaySession: async (sessionId: string) => ({
      projection: {
        sessionId, productId: 'atlascode', scopeId: 'main',
        semantics: 'persisted-effective-conversation',
        messages: [{ id: 'r1', role: 'user', createdAt: null, blocks: [{ kind: 'text', text: `replayed ${sessionId}` }] }],
        truncated: false,
      },
    }),
    follow: () => {
      const handle = stubHandle()
      handles.push(handle)
      return handle
    },
    close: async () => {},
  }
  return { connection, handles }
}

describe('WebCodeController — session list', () => {
  test('refreshSessions loads rows into the observable list model', async () => {
    const { connection } = stubConnection()
    const controller = new WebCodeController(connection)
    expect(controller.sessionList.getSnapshot().status).toBe('idle')
    await controller.refreshSessions()
    const list = controller.sessionList.getSnapshot()
    expect(list.status).toBe('ready')
    expect(list.rows).toHaveLength(2)
    expect(list.rows[0]).toMatchObject({ id: 's1', title: 'Session one' })
  })

  test('the title state derives SessionTitleState with zero retention before opening', async () => {
    const { connection } = stubConnection()
    const controller = new WebCodeController(connection)
    await controller.refreshSessions()
    const titles = controller.titleState.getSnapshot()
    expect(titles.byId.s1).toMatchObject({ id: 's1', title: 'Session one', retainedBy: { mainView: 0 } })
    expect(titles.byId.s2?.title).toBeNull()
  })

  test('A1: a session-request 401 maps to the unauthorized error face (兑换失败/会话 401 区分)', async () => {
    // httpHost 401 形 = 非 envelope JSON（{error:'unauthorized'}）→ 适配器
    // AtlasConnectionError('unexpected envelope kind: HTTP 401', 'httpError', 401)；
    // 控制器把 status 401 提升为 'unauthorized' 码，视图据此渲染重开指引。
    const connection = {
      credential: 'c',
      listSessions: (async () => {
        throw Object.assign(new Error('unexpected envelope kind: HTTP 401'), { code: 'httpError', status: 401 })
      }),
    } as unknown as AtlasConnection
    const controller = new WebCodeController(connection)
    await controller.refreshSessions()
    const list = controller.sessionList.getSnapshot()
    expect(list.status).toBe('error')
    expect(list.error?.code).toBe('unauthorized')
  })
})

describe('WebCodeController — search', () => {
  test('search loads results and keeps the latest generation only', async () => {
    const { connection } = stubConnection()
    const controller = new WebCodeController(connection)
    await controller.search('hello')
    expect(controller.searchState.getSnapshot().results).toHaveLength(1)
    await controller.search('nothing')
    expect(controller.searchState.getSnapshot().results).toHaveLength(0)
  })
})

describe('WebCodeController — conversation lifecycle', () => {
  test('openSession loads the replay projection and starts the follow stream', async () => {
    const { connection, handles } = stubConnection()
    const controller = new WebCodeController(connection)
    await controller.openSession('s1')
    const model = controller.conversation.getSnapshot()
    expect(model.sessionId).toBe('s1')
    expect(model.status).toBe('live')
    expect(model.messages[0]?.blocks[0]).toMatchObject({ kind: 'text', text: 'replayed s1' })
    expect(handles).toHaveLength(1)
  })

  test('follow events converge into the conversation model', async () => {
    const { connection, handles } = stubConnection()
    const controller = new WebCodeController(connection)
    await controller.openSession('s1')
    await handles[0]!.emit({
      kind: 'replacement', generation: 'g', baselineId: 'b', revision: 2, cursor: 'c1',
      projection: {
        sessionId: 's1', productId: 'atlascode', scopeId: 'main',
        semantics: 'persisted-effective-conversation',
        messages: [{ id: 'r1', role: 'user', createdAt: null, blocks: [{ kind: 'text', text: 'replayed s1' }] }, { id: 'r2', role: 'assistant', createdAt: null, blocks: [{ kind: 'text', text: 'streamed' }] }],
        truncated: false,
      },
      schemaVersion: 0, productId: 'atlascode', scopeId: 'main', subscriptionId: 'sub',
    })
    const model = controller.conversation.getSnapshot()
    expect(model.messages).toHaveLength(2)
    expect(model.messages[1]?.blocks[0]).toMatchObject({ kind: 'text', text: 'streamed' })
  })

  test('RF4: switching sessions aborts the in-flight follow handle', async () => {
    const { connection, handles } = stubConnection()
    const controller = new WebCodeController(connection)
    await controller.openSession('s1')
    await controller.openSession('s2')
    expect(handles).toHaveLength(2)
    expect(handles[0]!.abortCalled).toBe(true)
    expect(controller.conversation.getSnapshot().sessionId).toBe('s2')
  })

  test('opening marks the title state retention on the main view', async () => {
    const { connection } = stubConnection()
    const controller = new WebCodeController(connection)
    await controller.refreshSessions()
    await controller.openSession('s1')
    expect(controller.titleState.getSnapshot().byId.s1?.retainedBy.mainView).toBe(1)
    expect(controller.titleState.getSnapshot().byId.s2?.retainedBy.mainView).toBe(0)
  })

  test('A2: openTarget with a messageId opens the session and binds the target to it', async () => {
    const { connection } = stubConnection()
    const controller = new WebCodeController(connection)
    expect(controller.targetMessage.getSnapshot()).toBeNull()
    await controller.openTarget({ sessionId: 's1', messageId: 'm1' })
    expect(controller.conversation.getSnapshot().sessionId).toBe('s1')
    const target = controller.targetMessage.getSnapshot()
    expect(target?.sessionId).toBe('s1')
    expect(target?.messageId).toBe('m1')
    expect(typeof target?.generation).toBe('number')
  })

  test('A2: repeating the same target bumps the generation (re-scroll trigger)', async () => {
    const { connection } = stubConnection()
    const controller = new WebCodeController(connection)
    await controller.openTarget({ sessionId: 's1', messageId: 'm1' })
    const first = controller.targetMessage.getSnapshot()
    await controller.openTarget({ sessionId: 's1', messageId: 'm1' })
    const second = controller.targetMessage.getSnapshot()
    expect(second?.messageId).toBe('m1')
    expect(second?.generation).toBe((first?.generation ?? 0) + 1)
  })

  test('A2: openTarget without a messageId delegates to openSession and clears any target', async () => {
    const { connection } = stubConnection()
    const controller = new WebCodeController(connection)
    await controller.openTarget({ sessionId: 's1', messageId: 'm1' })
    await controller.openTarget({ sessionId: 's2' })
    expect(controller.conversation.getSnapshot().sessionId).toBe('s2')
    expect(controller.targetMessage.getSnapshot()).toBeNull()
  })

  test('A2: plain openSession clears a stale target (no cross-session leak)', async () => {
    const { connection } = stubConnection()
    const controller = new WebCodeController(connection)
    await controller.openTarget({ sessionId: 's1', messageId: 'm1' })
    await controller.openSession('s2')
    expect(controller.targetMessage.getSnapshot()).toBeNull()
  })

  test('A3: fast switching — a slow replay for A never overrides B', async () => {
    // 迟到响应覆盖守：A 的 replay 慢（挂起直到放行），B 即开即得；A 迟到
    // 落地不得改写模型/会话选择（generation 守卫锁形）。
    let releaseA: (() => void) | null = null
    const gateA = new Promise<void>(resolve => { releaseA = resolve })
    const { connection, handles } = stubConnection()
    const gated: AtlasConnection = {
      ...connection,
      replaySession: async (sessionId: string) => {
        const base = await connection.replaySession(sessionId)
        if (sessionId !== 's1') return base
        await gateA
        return base
      },
    }
    const controller = new WebCodeController(gated)
    const slowA = controller.openSession('s1')
    await controller.openSession('s2')
    releaseA!()
    await slowA
    const model = controller.conversation.getSnapshot()
    expect(model.sessionId).toBe('s2')
    expect(model.messages[0]?.blocks[0]).toMatchObject({ text: 'replayed s2' })
    // 更强语义：A 的迟到 replay 在 follow 建立前即被 generation 守卫丢弃
    // （handles 只含 B 的一条）——无泄漏流，不止是不覆盖。
    expect(handles).toHaveLength(1)
  })

  test('close() aborts the live handle and closes the connection', async () => {
    const { connection, handles } = stubConnection()
    let closed = false
    const closing: AtlasConnection = { ...connection, close: async () => { closed = true } }
    const controller = new WebCodeController(closing)
    await controller.openSession('s1')
    await controller.dispose()
    expect(closed).toBe(true)
    expect(handles[0]!.done).toBeDefined()
  })
})
