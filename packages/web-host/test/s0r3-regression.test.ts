import { describe, expect, test } from 'bun:test'

// S0-R3 消费侧回归三腿（工单 §9-7 有界拒形终裁 + Main 0.1.118 单信号对表；
// 上游 0.1.118 锚：cli.js 18,214,475B / 133f279a…de8cb089 已逐字对上）：
// 腿① 超大记录/transcript → resourceLimit（零半投影、message 零盘路径）；
// 腿② 环链 → 有界拒 gap-null 语义（零 hang/零 OOM；corruptData 非格面）；
// 腿③ ABA 窗 → 读中身份变化分态 replay=ioUnavailable retryable（交接窗
// 双采样守卫承载；fd 链函数内四点=上游 0.1.118 生产腿已验）。
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDefaultReadonlySessionRuntime, createReadonlySessionRuntime } from '@atlaswork/atlascode/web-session-runtime'
import { WebSessionError } from '@atlaswork/atlascode/web-session-runtime'

function seededTranscript(dir: string, name: string, entries: string[]): string {
  writeFileSync(join(dir, `${name}.jsonl`), entries.join('\n') + '\n')
  return name
}

const userLine = (uuid: string, parentUuid: string | null, text: string, ts: string) =>
  JSON.stringify({ type: 'user', uuid, parentUuid, timestamp: ts, message: { role: 'user', content: [{ type: 'text', text }] } })

describe('S0-R3 consumer regression legs (0.1.118 anchor)', () => {
  test('腿① oversized transcript → resourceLimit, sanitized message, no half-projection', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'atlasweb-leg1-'))
    try {
      // 64 行 × ~280B ≈ 18KB > 1024B 界（loader maxBytes 预解析检查点）
      const lines = Array.from({ length: 64 }, (_, i) =>
        userLine(`u${i}`, i === 0 ? null : `u${i - 1}`, 'x'.repeat(200), `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}Z`),
      )
      seededTranscript(dir, 'big', lines)
      const rt = createDefaultReadonlySessionRuntime({
        productId: 'atlascode',
        scopes: [{ scopeId: 's', storageDir: dir }],
        limits: { maxTranscriptBytes: 1024 },
      })
      await rt.start()
      try {
        let threw: unknown
        try {
          await rt.replaySession({ scopeId: 's', sessionId: 'big' })
        } catch (e) {
          threw = e
        }
        expect(threw).toBeInstanceOf(WebSessionError)
        const werr = threw as InstanceType<typeof WebSessionError>
        expect(werr.code).toBe('resourceLimit')
        expect(werr.message).not.toContain(dir) // message 安全化：零盘路径
      } finally {
        await rt.close()
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('腿② cyclic snip chain → bounded gap-null rejection (no hang, no corruptData requirement)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'atlasweb-leg2-'))
    try {
      // 段 0 三步链直译：snip 区 A/B 互环 + 存活 C.parentUuid=A + 后继叶
      const lines = [
        userLine('r1', null, 'root', '2026-01-01T00:00:00Z'),
        userLine('A', 'B', 'cycle-A', '2026-01-01T00:00:01Z'),
        userLine('B', 'A', 'cycle-B', '2026-01-01T00:00:02Z'),
        userLine('C', 'A', 'survivor', '2026-01-01T00:00:03Z'),
        JSON.stringify({ type: 'assistant', uuid: 'leaf1', parentUuid: 'C', timestamp: '2026-01-01T00:00:04Z', message: { role: 'assistant', id: 'm1', model: 'probe', stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] } }),
        JSON.stringify({ type: 'assistant', uuid: 'bnd', parentUuid: 'leaf1', timestamp: '2026-01-01T00:00:05Z', message: { role: 'assistant', id: 'm2', model: 'probe', stop_reason: 'end_turn', content: [{ type: 'text', text: 'b' }] }, snipMetadata: { removedUuids: ['A', 'B'] } }),
      ]
      seededTranscript(dir, 'cycle', lines)
      const rt = createDefaultReadonlySessionRuntime({
        productId: 'atlascode',
        scopes: [{ scopeId: 's', storageDir: dir }],
      })
      await rt.start()
      try {
        const list = await rt.listSessions({ scopeId: 's' })
        expect(list.sessions.map(s => s.sessionId)).toContain('cycle')
        const replay = await rt.replaySession({ scopeId: 's', sessionId: 'cycle' })
        const uuids = replay.projection.messages.map((m: { id: string }) => m.id)
        expect(uuids).toContain('C')
        expect(uuids).toContain('leaf1')
        expect(uuids).not.toContain('A') // 环内不可达 → gap-null 有界拒
        expect(uuids).not.toContain('B')
        // gap-null 语义（§9-7 终裁形）：环区不可达 → C 成为链根，
        // r1 不经环区回链——链 = [C, leaf1, bnd]，有界收敛零 hang。
        expect(uuids).toEqual(['C', 'leaf1', 'bnd'])
      } finally {
        await rt.close()
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('腿③ ABA window → identity change mid-read surfaces ioUnavailable retryable', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'atlasweb-leg3-'))
    try {
      seededTranscript(dir, 'aba', [userLine('u1', null, 'hi', '2026-01-01T00:00:00Z')])
      // 交接窗双采样守卫承载：pre-stat 与 post-stat 三元组不等 → 分态
      let calls = 0
      const flippyAdapter = {
        start: async () => {},
        close: async () => {},
        listSessionFiles: async () => [{ sessionId: 'aba', filePath: join(dir, 'aba.jsonl'), sizeBytes: 100, updatedAt: 'x', createdAt: null }],
        readTranscript: async () => new Uint8Array(100),
        statTranscript: async () => {
          calls++
          return calls === 1 ? { sizeBytes: 100, mtimeMs: 1, ino: 1 } : { sizeBytes: 200, mtimeMs: 2, ino: 2 } // 读中被替换
        },
        readTranscriptTail: async () => ({ bytes: new Uint8Array(0), sizeBytes: 100, ino: 1 }),
        resolveTranscriptPath: async () => join(dir, 'aba.jsonl'),
      }
      const rt = createReadonlySessionRuntime({
        productId: 'atlascode',
        scopes: [{ scopeId: 's', storageDir: dir }],
        engine: {
          loadTranscriptFull: async () => ({ messages: new Map(), leafUuids: new Set() }),
          buildConversationChain: () => [],
        },
        adapter: flippyAdapter as never,
      })
      await rt.start()
      try {
        let threw: unknown
        try {
          await rt.replaySession({ scopeId: 's', sessionId: 'aba' })
        } catch (e) {
          threw = e
        }
        expect(threw).toBeInstanceOf(WebSessionError)
        const werr = threw as InstanceType<typeof WebSessionError>
        expect(werr.code).toBe('ioUnavailable')
        expect(werr.retryable).toBe(true) // 不连续分态：零半旧半新交付
      } finally {
        await rt.close()
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
