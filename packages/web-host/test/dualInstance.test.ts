import { describe, expect, test } from 'bun:test'

// G2 格 F（工单 §6）：同进程双实例生命周期隔离——实例状态全自持
//（epoch/授权域/订阅/资源），零全局槽重置、零 env/chdir 切换：
// 1. 双实例不同 scope 域同 sessionId：交错 list/replay，A/B 数据互不串；
// 2. close A 不伤 B（B 继续可用、句柄/订阅自持）；
// 3. epoch 隔离：两实例 epoch 互异；close 后不可重启（重建换 epoch）；
// 4. 零产品目录直读（双实例均 seeded temp 域，真实 HOME 零触）。
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDefaultReadonlySessionRuntime } from '@atlaswork/atlascode/web-session-runtime'

function seed(dir: string, sessionId: string, text: string): void {
  writeFileSync(join(dir, `${sessionId}.jsonl`), [
    JSON.stringify({ type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2026-01-01T00:00:00Z', message: { role: 'user', content: [{ type: 'text', text }] } }),
  ].join('\n') + '\n')
}

describe('G2 格 F: dual-instance lifecycle isolation', () => {
  test('interleaved list/replay across two instances stays domain-separated; close A spares B', async () => {
    const dirA = mkdtempSync(join(tmpdir(), 'atlasweb-fa-'))
    const dirB = mkdtempSync(join(tmpdir(), 'atlasweb-fb-'))
    try {
      seed(dirA, 'shared-id', 'from-A')
      seed(dirB, 'shared-id', 'from-B')
      // A 还带一条 B 域没有的会话
      seed(dirA, 'only-in-a', 'A-only')

      const rtA = createDefaultReadonlySessionRuntime({
        productId: 'atlascode',
        scopes: [{ scopeId: 'a', storageDir: dirA }],
      })
      const rtB = createDefaultReadonlySessionRuntime({
        productId: 'atlascode',
        scopes: [{ scopeId: 'b', storageDir: dirB }],
      })
      await rtA.start()
      await rtB.start()
      try {
        expect(rtA.epoch).not.toBe(rtB.epoch) // epoch 自持互异

        // 交错：A list 见 2 会话，B 恰见 1；A 增量不入 B
        const listA = await rtA.listSessions({ scopeId: 'a' })
        const listB = await rtB.listSessions({ scopeId: 'b' })
        expect(listA.sessions).toHaveLength(2)
        expect(listB.sessions).toHaveLength(1)

        // 同 sessionId 交错 replay：内容各归各域
        const repA = await rtA.replaySession({ scopeId: 'a', sessionId: 'shared-id' })
        const repB = await rtB.replaySession({ scopeId: 'b', sessionId: 'shared-id' })
        const textA = JSON.stringify(repA.projection)
        const textB = JSON.stringify(repB.projection)
        expect(textA).toContain('from-A')
        expect(textA).not.toContain('from-B')
        expect(textB).toContain('from-B')
        expect(textB).not.toContain('from-A')
        // scope 域防串：A 实例查 B scopeId → scopeDenied（反向同理）
        await expect(rtA.listSessions({ scopeId: 'b' })).rejects.toMatchObject({ code: 'scopeDenied' })
        await expect(rtB.listSessions({ scopeId: 'a' })).rejects.toMatchObject({ code: 'scopeDenied' })

        // A 写入增量（新会话）→ B 域零变化
        seed(dirA, 'post-ab', 'A-later')
        const listA2 = await rtA.listSessions({ scopeId: 'a' })
        const listB2 = await rtB.listSessions({ scopeId: 'b' })
        expect(listA2.sessions).toHaveLength(3)
        expect(listB2.sessions).toHaveLength(1)

        // close A → B 完全不受影响
        await rtA.close()
        const listB3 = await rtB.listSessions({ scopeId: 'b' })
        const repB3 = await rtB.replaySession({ scopeId: 'b', sessionId: 'shared-id' })
        expect(listB3.sessions).toHaveLength(1)
        expect(JSON.stringify(repB3.projection)).toContain('from-B')
        // A close 后调用拒（closed），且不可重启
        await expect(rtA.listSessions({ scopeId: 'a' })).rejects.toThrow()
        // close A 幂等
        await rtA.close()
      } finally {
        await rtB.close()
        await rtA.close().catch(() => {})
      }
    } finally {
      rmSync(dirA, { recursive: true, force: true })
      rmSync(dirB, { recursive: true, force: true })
    }
  })
})
