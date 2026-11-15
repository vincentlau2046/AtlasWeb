import { describe, expect, test } from 'bun:test'

// G1 host 骨架判据（S0 总约 §4）：
// 1. scopes 必显式注入；缺省/空 → fail-closed（无默认 HOME 回落）；
// 2. scopeId/storageDir 逐项校验（非空 id、绝对路径）；
// 3. 生命周期委托 runtime：start 后可用、close 幂等、close 后拒绝；
// 4. 零全局 env 读取、零产品目录直读（构造期不触 fs 的产品探测面）。
describe('createSessionHost (G1 skeleton)', () => {
  const fakeEngine = {
    loadTranscriptFull: async () => ({ messages: new Map(), leafUuids: new Set() }),
    buildConversationChain: () => [],
  }

  test('fails closed on missing/empty scopes without HOME fallback', async () => {
    const { createSessionHost } = await import('../src/sessionHost')
    for (const bad of [undefined, []]) {
      let threw = false
      try {
        createSessionHost({ productId: 'atlascode', scopes: bad as never, engine: fakeEngine })
      } catch {
        threw = true
      }
      expect(threw).toBe(true)
    }
  })

  test('rejects invalid scope entries (empty id, relative path)', async () => {
    const { createSessionHost } = await import('../src/sessionHost')
    const cases = [
      [{ scopeId: '', storageDir: '/tmp/x' }],
      [{ scopeId: 'a', storageDir: 'relative/path' }],
      [{ scopeId: 'a', storageDir: '/tmp/x' }, { scopeId: 'a', storageDir: '/tmp/y' }], // 重复 id
    ]
    for (const scopes of cases) {
      let threw = false
      try {
        createSessionHost({ productId: 'atlascode', scopes, engine: fakeEngine })
      } catch {
        threw = true
      }
      expect(threw).toBe(true)
    }
  })

  test('delegates lifecycle to runtime: start → list OK, close idempotent, post-close reject', async () => {
    const { createSessionHost } = await import('../src/sessionHost')
    const { mkdtempSync, rmSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = mkdtempSync(join(tmpdir(), 'atlasweb-host-'))
    try {
      const host = createSessionHost({
        productId: 'atlascode',
        scopes: [{ scopeId: 'demo', storageDir: dir }],
        engine: fakeEngine,
      })
      try {
        await host.listSessions({ scopeId: 'demo' })
        throw new Error('pre-start must reject')
      } catch (error) {
        expect(String((error as Error).message)).toContain('not started')
      }
      await host.start()
      const list = await host.listSessions({ scopeId: 'demo' })
      expect(Array.isArray(list.sessions)).toBe(true)
      try {
        await host.listSessions({ scopeId: 'other' })
        throw new Error('unmapped scope must reject')
      } catch (error) {
        expect((error as { code?: string }).code).toBe('scopeDenied')
      }
      await host.close()
      await host.close() // 幂等
      try {
        await host.listSessions({ scopeId: 'demo' })
        throw new Error('post-close must reject')
      } catch (error) {
        expect(String((error as Error).message)).toContain('closed')
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('exposes resolved limits and epoch from runtime for pairing evidence', async () => {
    const { createSessionHost } = await import('../src/sessionHost')
    const { mkdtempSync, rmSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = mkdtempSync(join(tmpdir(), 'atlasweb-host2-'))
    try {
      const host = createSessionHost({
        productId: 'atlascode',
        scopes: [{ scopeId: 'demo', storageDir: dir }],
        engine: fakeEngine,
        limits: { pageSize: 7 },
      })
      expect(host.epoch).toBeTruthy()
      expect(host.limits.pageSize).toBe(7)
      await host.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('close during pending startup wins the race; runtime stays terminal', async () => {
    const { createSessionHost } = await import('../src/sessionHost')
    const { mkdtempSync, rmSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = mkdtempSync(join(tmpdir(), 'atlasweb-host3-'))
    try {
      // 慢启动 runtime：让 close() 有机会落在 start() await 窗口内
      const slowRuntime = {
        epoch: 'slow',
        limits: { pageSize: 1 },
        startStarted: 0,
        start() {
          this.startStarted++
          return new Promise<void>(resolve => setTimeout(resolve, 30))
        },
        listSessions: async () => {
          throw new Error('runtime must not serve after close')
        },
        close: async () => {},
      }
      const host = createSessionHost({
        productId: 'atlascode',
        scopes: [{ scopeId: 'demo', storageDir: dir }],
        engine: fakeEngine,
        runtimeOverride: slowRuntime as never,
      })
      const startPromise = host.start()
      await host.close() // 竞态：启动中关闭
      await startPromise.catch(() => {}) // 启动可能以 closed 拒绝，不崩即可
      let startThrew = false
      try {
        await host.start() // 关闭后重启必须被拒
      } catch {
        startThrew = true
      }
      expect(startThrew).toBe(true)
      let listThrew = false
      try {
        await host.listSessions({ scopeId: 'demo' })
      } catch {
        listThrew = true
      }
      expect(listThrew).toBe(true)
      expect(slowRuntime.startStarted).toBeLessThanOrEqual(1) // 关闭后不得二次 start
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
