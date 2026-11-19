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
