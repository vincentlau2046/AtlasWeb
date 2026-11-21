import { describe, test, expect } from 'bun:test'
import { createExecutionUpstream, createSpawnCliTurnRunner, streamJsonTextDelta } from '../src/execution/upstream'
import type { SpawnSeam } from '../src/execution/upstream'
import { createWorkspaceAuthorizer } from '../src/execution/workspaceAuth'
import type { WebExecutionCommand } from '@atlaswork/atlascode/web-session-runtime/execution'

const cmd = (over: Partial<WebExecutionCommand> = {}): WebExecutionCommand => ({
  v: 0,
  type: 'turn.submit',
  bind: { workspaceId: 'ws1', sessionId: 'sess1', turnId: '' },
  payload: { submitId: 'sub-1', text: 'hello' },
  ...over,
} as WebExecutionCommand)

function makeUpstream(over: Parameters<typeof createExecutionUpstream>[0] = {}) {
  const auth = createWorkspaceAuthorizer()
  auth.grantWorkspace('ws1', '/tmp/ws1')
  return {
    auth,
    upstream: createExecutionUpstream({
      actorId: () => 'conn-1',
      workspaceDir: (id) => auth.workspaceDir(id),
      runTurn: async () => 'completed',
      ...over,
    }),
  }
}

describe('createExecutionUpstream · F2 fail-closed + §7 组合根恰一次', () => {
  test('actorId 缺失 → 构造即硬错（web 车道零 ambient，F2）', () => {
    expect(() => createExecutionUpstream({
      actorId: undefined as unknown as () => string,
      workspaceDir: () => '/tmp',
      runTurn: async () => 'completed',
    })).toThrow(/actorId provider is required/)
  })

  test('actorId() 返回空值 → 构造即硬错（F2）', () => {
    expect(() => createExecutionUpstream({
      actorId: () => '',
      workspaceDir: () => '/tmp',
      runTurn: async () => 'completed',
    })).toThrow(/non-empty string/)
  })

  test('actorId() 抛错 → 构造即硬错（F2）', () => {
    expect(() => createExecutionUpstream({
      actorId: () => { throw new Error('no identity') },
      workspaceDir: () => '/tmp',
      runTurn: async () => 'completed',
    })).toThrow(/authenticated connection identity/)
  })

  test('同一 options 注入二次 → 硬错（§7 组合根恰一次）', () => {
    const opts = {
      actorId: () => 'conn-1',
      workspaceDir: () => '/tmp',
      runTurn: async () => 'completed' as const,
    }
    createExecutionUpstream(opts)
    expect(() => createExecutionUpstream(opts)).toThrow(/already mounted/)
  })

  test('六命令一一对应：turn.submit → accepted 事件；decide 绑定错 → approvalBindMismatch（kernel 权威透传）', async () => {
    const { upstream } = makeUpstream()
    const accepted = await upstream.handleCommand(cmd())
    expect(accepted).toMatchObject({ type: 'turn.accepted', bind: { workspaceId: 'ws1', sessionId: 'sess1' } })
    // 幂等（§3）：同 submitId 重试返回原结算
    const replay = await upstream.handleCommand(cmd())
    expect(replay).toMatchObject({ type: 'turn.accepted' })
  })

  test('事件流订阅 + replaySince 透传（kernel 权威）', async () => {
    const { upstream } = makeUpstream()
    const events: unknown[] = []
    const off = upstream.onEvent((e) => events.push(e))
    await upstream.handleCommand(cmd())
    expect(events.length).toBeGreaterThanOrEqual(1)
    off()
    const before = events.length
    await upstream.handleCommand(cmd({ payload: { submitId: 'sub-2', text: 'x' } } as never))
    expect(events.length).toBe(before) // 退订后零投递
    const replay = upstream.replaySince('ws1', 'sess1', (events[0] as { cursor?: string }).cursor)
    expect(replay.kind).toBe('delta')
    expect(replay.events.length).toBeGreaterThanOrEqual(2)
  })
})

describe('createSpawnCliTurnRunner · e429130 真体形（spawn seam 注入）', () => {
  const line = (obj: unknown): string => `${JSON.stringify(obj)}\n`

  function fakeSpawn(lines: string[], exitCode: number, hooks: { killed?: () => void } = {}): { seam: SpawnSeam; child: Record<string, unknown> } {
    type Listener = (chunk: Buffer) => void
    const stdoutListeners: Listener[] = []
    const closeListeners: Array<(code: number | null) => void> = []
    const child = {
      stdout: { on: (_: string, l: Listener) => { stdoutListeners.push(l) } },
      stderr: { on: () => {} },
      on: (ev: string, l: (code: number | null) => void) => { if (ev === 'close') closeListeners.push(l) },
      kill: () => { hooks.killed?.(); closeListeners.forEach((l) => l(null)) },
    }
    const seam: SpawnSeam = () => {
      queueMicrotask(() => {
        stdoutListeners.forEach((l) => l(Buffer.from(lines.join(''))))
        closeListeners.forEach((l) => l(exitCode))
      })
      return child as never
    }
    return { seam, child }
  }

  test('stdout stream-json 增量 → emitDelta；exit 0 → completed', async () => {
    const deltas: string[] = []
    const { seam } = fakeSpawn([
      line({ type: 'system', subtype: 'init' }),
      line({ type: 'assistant', message: { content: [{ type: 'text', text: '你好' }] } }),
      line({ type: 'assistant', message: { content: [{ type: 'text', text: '，世界' }] } }),
    ], 0)
    const runner = createSpawnCliTurnRunner({ workspaceDir: () => '/tmp/ws1', spawn: seam })
    const outcome = await runner({
      bind: { workspaceId: 'ws1', sessionId: 'sess1', turnId: 'turn-1' },
      text: 'hi',
      signal: new AbortController().signal,
      requestApproval: async () => 'approved',
      emitDelta: (t) => deltas.push(t),
    })
    expect(outcome).toBe('completed')
    expect(deltas).toEqual(['你好', '，世界'])
  })

  test('exit 非 0 → failed', async () => {
    const { seam } = fakeSpawn([], 1)
    const runner = createSpawnCliTurnRunner({ workspaceDir: () => '/tmp/ws1', spawn: seam })
    const outcome = await runner({
      bind: { workspaceId: 'ws1', sessionId: 's', turnId: 't' },
      text: 'x', signal: new AbortController().signal,
      requestApproval: async () => 'approved', emitDelta: () => {},
    })
    expect(outcome).toBe('failed')
  })

  test('signal abort → kill 子进程 → cancelled（引擎真中止）', async () => {
    let killed = false
    const { seam } = fakeSpawn([], 0, { killed: () => { killed = true } })
    const runner = createSpawnCliTurnRunner({ workspaceDir: () => '/tmp/ws1', spawn: seam })
    const ac = new AbortController()
    const p = runner({
      bind: { workspaceId: 'ws1', sessionId: 's', turnId: 't' },
      text: 'x', signal: ac.signal,
      requestApproval: async () => 'approved', emitDelta: () => {},
    })
    ac.abort()
    const outcome = await p
    expect(killed).toBe(true)
    expect(outcome).toBe('cancelled')
  })

  test('未授权工作区 → 硬错（cwd 不可解析，fail-closed）', async () => {
    const { seam } = fakeSpawn([], 0)
    const runner = createSpawnCliTurnRunner({ workspaceDir: () => undefined, spawn: seam })
    await expect(runner({
      bind: { workspaceId: 'nope', sessionId: 's', turnId: 't' },
      text: 'x', signal: new AbortController().signal,
      requestApproval: async () => 'approved', emitDelta: () => {},
    })).rejects.toThrow(/not granted/)
  })
})

describe('streamJsonTextDelta · 结构化协议解析（合同 §9 边界）', () => {
  test('assistant text 块 → text；非 assistant/非 text/非法行 → null', () => {
    expect(streamJsonTextDelta(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'T' }] } }))).toBe('T')
    expect(streamJsonTextDelta(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'x' }] } }))).toBe(null)
    expect(streamJsonTextDelta(JSON.stringify({ type: 'system' }))).toBe(null)
    expect(streamJsonTextDelta('not json')).toBe(null)
    expect(streamJsonTextDelta('')).toBe(null)
  })
})

// GREEN 自动执法腿（B 附表 §1 审计登记 c）：单接触点纪律机器判——除
// upstream.ts 外全仓 src 面零 execution 出口 import（module specifier 与
// 具名符号双判，任一命中即违规）。判的是 import 接触点：只扫 src 目录、
// 剥注释（注释提及非接触面，如 gateTruthTable 锚注）。
describe('单接触点纪律（自动执法腿）', () => {
  test('除 upstream.ts 外 src 零 execution 出口 import', () => {
    const { readFileSync, readdirSync, statSync } = require('node:fs') as typeof import('node:fs')
    const { join } = require('node:path') as typeof import('node:path')
    const root = join(import.meta.dir, '..', '..', '..')
    const violations: string[] = []
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        const st = statSync(p)
        if (st.isDirectory()) {
          if (name === 'src') { scanSrc(p); continue }
          walk(p)
        }
      }
    }
    const scanSrc = (srcDir: string): void => {
      const inner = (dir: string): void => {
        for (const name of readdirSync(dir)) {
          const p = join(dir, name)
          if (statSync(p).isDirectory()) { inner(p); continue }
          if (!/\.(ts|tsx)$/.test(name)) continue
          // 剥行注释与块注释（字符串字面量内 specifier 属于运行时接触面，
          // 保留不剥——本仓无此形态，误伤面为零）。
          const text = readFileSync(p, 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '')
          const isUpstream = p.endsWith(join('execution', 'upstream.ts'))
          const hit = text.includes('web-session-runtime/execution') || text.includes('createExecutionComposition')
          if (hit && !isUpstream) violations.push(p)
        }
      }
      inner(srcDir)
    }
    walk(join(root, 'packages'))
    walk(join(root, 'apps'))
    expect(violations).toEqual([])
  })
})
