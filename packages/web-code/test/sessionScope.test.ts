import { describe, expect, test } from 'bun:test'

// session scope 适配器（ui-session 等价件，浏览器首启现形 2026-11-20）：
// renderRoot 全树包 ScopeProvider('session-maybe')，适配器须恒安装（blank =
// key undefined 绑定，"maybe" 语义在绑定级）。判据：
//   1. controller.sessionId 源翻转（openSession 侧写）；
//   2. 适配器 current：blank ↔ selected（key/ctx）；
//   3. adoption 恒稳：同 id 重开 ctx 恒同（零重挂），换 id ctx 新；
//   4. bindingSource：undefined→current；命中 current id→current；
//      未命中 id→blank（不可解析 id 走 no-session 分支）；
//   5. renderArea：blank→empty 分支，selected→children；
//   6. apply() 接线：ctx.slots.installScope('session', adapter) 恰一次。
import { WebCodeController } from '../src/controller.ts'
import { createSessionScopeAdapter } from '../src/sessionScope.ts'
import { apply, type WebCodeConfig } from '../src/index.tsx'
import type { AtlasConnection, AtlasFollowHandle } from '@atlasweb/web-connection'
import type { StandardSourceBinding } from '@atlasweb/web-slots'

/** Manual-emit follow handle stub（controller.test.ts 同形）。 */
function stubHandle(): AtlasFollowHandle {
  let ended = false
  const done = new Promise<void>(resolve => { ended = ended; resolve(void 0) })
  void ended
  return {
    events: (async function* () { /* 立即终态 */ })(),
    abort() { /* no-op */ },
    done,
  }
}

/** Connection stub（seeded s1/s2）。 */
function stubConnection(): AtlasConnection {
  return {
    credential: 'c',
    listSessions: async () => ({
      sessions: [
        { sessionId: 's1', title: 'Session one', createdAt: null, updatedAt: '2026-11-20T01:00:00Z', messageCount: 4, productId: 'atlascode', scopeId: 'main' },
        { sessionId: 's2', title: null, createdAt: null, updatedAt: '2026-11-19T01:00:00Z', messageCount: null, productId: 'atlascode', scopeId: 'main' },
      ],
    }),
    searchSessions: async () => ({ results: [] }),
    replaySession: async (sessionId: string) => ({
      projection: {
        sessionId, productId: 'atlascode', scopeId: 'main',
        semantics: 'persisted-effective-conversation',
        messages: [{ id: 'r1', role: 'user', createdAt: null, blocks: [{ kind: 'text', text: `replayed ${sessionId}` }] }],
        truncated: false,
      },
    }),
    follow: () => stubHandle(),
    close: async () => {},
  }
}

function bindingOf(source: { getSnapshot(): unknown }): StandardSourceBinding {
  return source.getSnapshot() as StandardSourceBinding
}

describe('session scope adapter（ui-session 等价件）', () => {
  test('controller.sessionId 源：null 起步，openSession 翻转', async () => {
    const controller = new WebCodeController(stubConnection())
    expect(controller.sessionId.getSnapshot()).toBeNull()
    await controller.openSession('s1')
    expect(controller.sessionId.getSnapshot()).toBe('s1')
  })

  test('current：blank 起步 → selected（key+ctx）→ blank（异常/关选不侧写，仅 open 翻转）', async () => {
    const controller = new WebCodeController(stubConnection())
    const adapter = createSessionScopeAdapter(controller)
    expect(bindingOf(adapter.current).key).toBeUndefined()
    await controller.openSession('s1')
    const selected = bindingOf(adapter.current)
    expect(selected.key).toBe('s1')
    expect(typeof (selected as { ctx?: object }).ctx).toBe('object')
  })

  test('adoption 恒稳：同 id 重开 ctx 恒同；换 id ctx 新且 key 随迁', async () => {
    const controller = new WebCodeController(stubConnection())
    const adapter = createSessionScopeAdapter(controller)
    await controller.openSession('s1')
    const first = bindingOf(adapter.current) as { key: string; ctx: object }
    await controller.openSession('s1')
    const reopen = bindingOf(adapter.current) as { key: string; ctx: object }
    expect(reopen.ctx).toBe(first.ctx)
    await controller.openSession('s2')
    const switched = bindingOf(adapter.current) as { key: string; ctx: object }
    expect(switched.key).toBe('s2')
    expect(switched.ctx).not.toBe(first.ctx)
  })

  test('bindingSource：undefined→current；命中 id→current；未命中 id→blank', async () => {
    const controller = new WebCodeController(stubConnection())
    const adapter = createSessionScopeAdapter(controller)
    await controller.openSession('s1')
    expect(adapter.bindingSource(undefined)).toBe(adapter.current)
    expect(adapter.bindingSource(null)).toBe(adapter.current)
    expect(adapter.bindingSource('s1')).toBe(adapter.current)
    expect(bindingOf(adapter.bindingSource('other')).key).toBeUndefined()
  })

  test('renderArea：blank→empty 分支；selected→children', async () => {
    const controller = new WebCodeController(stubConnection())
    const adapter = createSessionScopeAdapter(controller)
    const empty = (): string => 'EMPTY-BRANCH'
    const children = 'CHILDREN-NODE'
    expect(adapter.renderArea!(bindingOf(adapter.current), { empty, children })).toBe('EMPTY-BRANCH')
    await controller.openSession('s1')
    expect(adapter.renderArea!(bindingOf(adapter.current), { empty, children })).toBe('CHILDREN-NODE')
  })

  test('apply() 接线：installScope("session", adapter) 恰一次，适配器带 renderArea', async () => {
    const installs: Array<{ scope: string; adapter: object }> = []
    const ctx = {
      effect(fn: () => (() => void) | void): () => void {
        const dispose = fn()
        return () => { void dispose }
      },
      slots: {
        provideRoot(): () => void { return () => {} },
        register(): () => void { return () => {} },
        installScope(scope: string, adapter: object): () => void {
          installs.push({ scope, adapter })
          return () => {}
        },
      },
      reflect: { provide(name: string, service: unknown): unknown { return service } },
    }
    const config: WebCodeConfig = {
      connection: { baseUrl: 'http://stub', credential: 'pre-shared' },
      fetch: (async (input: unknown) => {
        const url = String(input instanceof Request ? input.url : input)
        if (url.includes('/sessions?scopeId=')) {
          return Response.json({ of: 'x', schemaVersion: 0, requestId: 'r', productId: 'atlascode', scopeId: 'main', kind: 'response', sessions: [] })
        }
        throw new Error(`unexpected fetch: ${url}`)
      }) as typeof fetch,
    }
    await apply(ctx as never, config)
    expect(installs).toHaveLength(1)
    expect(installs[0]!.scope).toBe('session')
    const adapter = installs[0]!.adapter as { current: { getSnapshot(): unknown }; renderArea?: unknown }
    expect(bindingOf(adapter.current).key).toBeUndefined()
    expect(typeof adapter.renderArea).toBe('function')
  })
})
