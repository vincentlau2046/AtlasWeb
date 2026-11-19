// T6-A Task 8 RED: 接线腿——entry apply(ctx, config) 在 stub ctx 上的
// provideRoot（sessions 根供给）+ sidebar/main 注册形 + fetch 级链路。
import { describe, expect, test } from 'bun:test'
import { apply, type WebCodeConfig } from '../src/index.tsx'

/** Envelope helper (web-host 成功形). */
function envelope(payload: Record<string, unknown>): Response {
  return Response.json({
    of: 'webSession', schemaVersion: 0, requestId: 'r', productId: 'atlascode',
    scopeId: 'main', kind: 'response', ...payload,
  })
}

function summary(id: string, title: string | null): Record<string, unknown> {
  return {
    sessionId: id, title, createdAt: '2026-11-20T00:00:00Z',
    updatedAt: '2026-11-20T01:00:00Z', messageCount: 3,
    productId: 'atlascode', scopeId: 'main',
  }
}

function projection(sessionId: string): Record<string, unknown> {
  return {
    sessionId, productId: 'atlascode', scopeId: 'main',
    semantics: 'persisted-effective-conversation',
    messages: [{ id: 'p1', role: 'user', createdAt: null, blocks: [{ kind: 'text', text: `replay ${sessionId}` }] }],
    truncated: false,
  }
}

function baseline(sessionId: string): Record<string, unknown> {
  return {
    kind: 'baseline', generation: '11111111-1111-4111-8111-111111111111',
    baselineId: '22222222-2222-4222-8222-222222222222', revision: 1, cursor: 'c0',
    projection: projection(sessionId), schemaVersion: 0, productId: 'atlascode',
    scopeId: 'main', subscriptionId: 'sub1',
  }
}

/** SSE response carrying one baseline then closed. */
function sseResponse(frames: unknown[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`))
      controller.close()
    },
  })
  return new Response(stream, { status: 200 })
}

/** Fetch stub routing the four faces over seeded fixtures. */
function stubFetch(): typeof fetch {
  return (async (input: unknown) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url.includes('/sessions?scopeId=')) return envelope({ sessions: [summary('s1', 'Session one'), summary('s2', null)] })
    if (url.includes('/sessions/search?')) return envelope({ results: [] })
    const replay = url.match(/\/sessions\/([^/]+)\/replay/)
    if (replay) return envelope({ projection: projection(decodeURIComponent(replay[1]!)) })
    const follow = url.match(/\/sessions\/([^/]+)\/follow/)
    if (follow) return sseResponse([baseline(decodeURIComponent(follow[1]!)), { kind: 'closed' }])
    throw new Error(`unexpected fetch: ${url}`)
  }) as typeof fetch
}

/** Recording stub context (Task 7 layout-test 形). */
function stubCtx() {
  const rootContributions: Array<Record<string, unknown>> = []
  const registrations: Array<Record<string, unknown>> = []
  const services = new Map<string, unknown>()
  const ctx = {
    effect(fn: () => (() => void) | void): () => void {
      const dispose = fn()
      return () => { void dispose }
    },
    slots: {
      provideRoot(contribution: Record<string, unknown>): () => void {
        rootContributions.push(contribution)
        return () => {}
      },
      register(options: Record<string, unknown>): () => void {
        registrations.push(options)
        return () => {}
      },
      entries(): unknown[] { return [] },
      subscribe(): () => void { return () => {} },
    },
    reflect: { provide(name: string, service: unknown): unknown { services.set(name, service); return service } },
    on(): () => void { return () => {} },
  }
  return { ctx, rootContributions, registrations, services }
}

const config: WebCodeConfig = {
  connection: { baseUrl: 'http://stub', credential: 'pre-shared' },
  fetch: stubFetch(),
}

describe('web-code entry wiring', () => {
  test('apply contributes the root sessions source and registers the two views', async () => {
    const { ctx, rootContributions, registrations, services } = stubCtx()
    await apply(ctx as never, config)
    // Root supply: hook name exactly 'sessions' (→ useSessions standard prop).
    expect(rootContributions).toHaveLength(1)
    const hooks = rootContributions[0]!.hooks as Record<string, unknown>
    expect(Object.keys(hooks)).toEqual(['sessions'])
    const source = hooks.sessions as { getSnapshot(): { byId: Record<string, { title: string | null }> } }
    expect(source.getSnapshot().byId.s1?.title).toBe('Session one')
    // Registrations: sidebar (single) + main keyed 'conversation'.
    expect(registrations).toHaveLength(2)
    expect(registrations[0]!.name).toBe('sidebar')
    expect(registrations[1]!.name).toBe('main')
    expect(registrations[1]!.key).toBe('conversation')
    // The conversation controller is reachable as a service.
    expect(services.has('conversation')).toBe(true)
  })

  test('openSession drives replay + follow to a live model and flips retention', async () => {
    const { ctx, services } = stubCtx()
    await apply(ctx as never, config)
    const controller = services.get('conversation') as {
      openSession(id: string): Promise<void>
      conversation: { getSnapshot(): { status: string; sessionId: string | null; messages: unknown[] } }
      titleState: { getSnapshot(): { byId: Record<string, { retainedBy: { mainView: number } }> } }
    }
    await controller.openSession('s1')
    const model = controller.conversation.getSnapshot()
    expect(model.status).toBe('live')
    expect(model.sessionId).toBe('s1')
    expect(model.messages.length).toBeGreaterThan(0)
    expect(controller.titleState.getSnapshot().byId.s1?.retainedBy.mainView).toBe(1)
  })
})
