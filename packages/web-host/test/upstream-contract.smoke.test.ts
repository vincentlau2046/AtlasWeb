import { describe, expect, test } from 'bun:test'

// G1 消费冒烟：contract 面可达 + runtime 生命周期纪律（fake engine 注入形，
// seeded sandbox；真实 engine 载体见 docs/upstream-pairing.md 登记缺口）。
describe('upstream @atlaswork/atlascode consumption', () => {
  test('web-contract exposes v0 schema face', async () => {
    const contract = await import('@atlaswork/atlascode/web-contract')
    const keys = Object.keys(contract)
    expect(keys.length).toBeGreaterThanOrEqual(40)
    for (const name of ['BaselineEventSchema', 'FollowSessionRequestSchema', 'ErrorEventSchema']) {
      expect(keys).toContain(name)
    }
  })

  test('runtime enforces lifecycle discipline (pre-start reject, close idempotent, epoch)', async () => {
    const { createReadonlySessionRuntime, WebSessionError } = await import('@atlaswork/atlascode/web-session-runtime')
    const { mkdtempSync, rmSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = mkdtempSync(join(tmpdir(), 'atlasweb-g1-'))
    try {
      const fakeEngine = {
        loadTranscriptFull: async () => ({ messages: new Map(), leafUuids: new Set() }),
        buildConversationChain: () => [],
      }
      const runtime = createReadonlySessionRuntime({
        productId: 'atlascode',
        scopes: [{ scopeId: 'smoke', storageDir: dir }],
        engine: fakeEngine,
      })
      try {
        await runtime.listSessions({ scopeId: 'smoke' })
        throw new Error('pre-start call must reject')
      } catch (error) {
        expect(error instanceof WebSessionError).toBe(true)
      }
      await runtime.start()
      const list = await runtime.listSessions({ scopeId: 'smoke' })
      expect(Array.isArray(list.sessions)).toBe(true)
      try {
        await runtime.listSessions({ scopeId: 'unauthorized' })
        throw new Error('cross-scope must reject')
      } catch (error) {
        expect((error as { code?: string }).code).toBe('scopeDenied')
      }
      await runtime.close()
      await runtime.close() // 幂等
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
