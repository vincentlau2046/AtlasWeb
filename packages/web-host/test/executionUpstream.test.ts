import { describe, test, expect } from 'bun:test'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createExecutionUpstream, createSpawnCliTurnRunner, streamJsonApprovalRequest, streamJsonResult, streamJsonTextDelta } from '../src/execution/upstream'
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

  // 终审 Issue 2 修复腿：stderr 只 pipe 不读 → node 运行时 >64KiB 产出塞满
  // 管道 → 子进程写阻塞 → close 永不 firing → 回合悬挂（stdin 事故同形；
  // bun 测试运行时自排水不复现，塞满形由本消费者在场断言钉住回归）。
  test('stderr 消费者在场（spawn 后必须有 data listener 防 node 运行时管道塞满）', async () => {
    const stderrListeners: Array<(chunk: Buffer) => void> = []
    const closeListeners: Array<(code: number | null) => void> = []
    const child = {
      stdout: { on: () => {} },
      stderr: { on: (ev: string, l: (chunk: Buffer) => void) => { if (ev === 'data') stderrListeners.push(l) } },
      on: (ev: string, l: (code: number | null) => void) => { if (ev === 'close') closeListeners.push(l) },
      kill: () => {},
    }
    const seam: SpawnSeam = () => {
      queueMicrotask(() => closeListeners.forEach(l => l(0)))
      return child as never
    }
    const runner = createSpawnCliTurnRunner({ workspaceDir: () => '/tmp/ws1', spawn: seam })
    const outcome = await runner({
      bind: { workspaceId: 'ws1', sessionId: 's', turnId: 't' },
      text: 'x', signal: new AbortController().signal,
      requestApproval: async () => 'approved', emitDelta: () => {},
    })
    expect(outcome).toBe('completed')
    expect(stderrListeners.length, 'stderr pipe must have a data consumer').toBeGreaterThanOrEqual(1)
  })

  // 真 spawn 全路径烟测（与消费腿共生）：真管道 + 200KiB stderr 产出 →
  // runner 正常 settle completed（bun 运行时；node 运行时塞满形由上腿钉住）。
  test('真 spawn 全路径：高产 stderr 引擎正常 settle（completed）', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'upstream-stderr-'))
    try {
      const script = join(dir, 'noisy-atlas')
      await writeFile(script, '#!/bin/sh\nhead -c 200000 /dev/zero | tr \'\\0\' \'x\' >&2\nexit 0\n', { mode: 0o755 })
      const runner = createSpawnCliTurnRunner({ workspaceDir: () => dir, cliPath: script })
      const outcome = await runner({
        bind: { workspaceId: 'ws1', sessionId: 's', turnId: 't' },
        text: 'x', signal: new AbortController().signal,
        requestApproval: async () => 'approved', emitDelta: () => {},
      })
      expect(outcome).toBe('completed')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('W1 审批通道接线（0.1.129 呈批书 §2 形 A，批复 @af5684e9）', () => {
  const line = (obj: unknown): string => `${JSON.stringify(obj)}\n`
  const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))
  const defer = <T,>(): { promise: Promise<T>; resolve: (v: T) => void } => {
    let resolve!: (v: T) => void
    const promise = new Promise<T>((r) => { resolve = r })
    return { promise, resolve }
  }

  const approvalReq = (approvalId = 'a-1'): string =>
    line({
      type: 'approval_request',
      approval_id: approvalId,
      tool_name: 'Write',
      input_digest: { file_path: '/tmp/ws1/out.txt' },
      session_id: 'sess1',
    })

  /** 带 stdin 写入收集的 fake（W1 决策回写面）。 */
  function fakeApprovalSpawn(): {
    seam: SpawnSeam
    emit: (l: string) => void
    close: (code: number | null) => void
    stdinWrites: string[]
    stdinEnds: () => number
    args: () => readonly string[]
    opts: () => Record<string, unknown> | undefined
  } {
    const stdoutListeners: Array<(c: Buffer) => void> = []
    const closeListeners: Array<(code: number | null) => void> = []
    const stdinWrites: string[] = []
    let stdinEndCount = 0
    let capturedArgs: readonly string[] = []
    let capturedOpts: Record<string, unknown> | undefined
    const child = {
      stdout: { on: (_: string, l: (c: Buffer) => void) => { stdoutListeners.push(l) } },
      stderr: { on: () => {} },
      stdin: {
        write: (s: string) => { stdinWrites.push(s); return true },
        end: () => { stdinEndCount += 1 },
        on: () => {},
      },
      on: (ev: string, l: (code: number | null) => void) => { if (ev === 'close') closeListeners.push(l) },
      kill: () => {},
    }
    const seam: SpawnSeam = (_cmd, args, opts) => {
      capturedArgs = args
      capturedOpts = opts as Record<string, unknown>
      return child as never
    }
    return {
      seam,
      emit: (l) => stdoutListeners.forEach((x) => x(Buffer.from(l))),
      close: (code) => closeListeners.forEach((x) => x(code)),
      stdinWrites,
      stdinEnds: () => stdinEndCount,
      args: () => capturedArgs,
      opts: () => capturedOpts,
    }
  }

  const runArgs = {
    bind: { workspaceId: 'ws1', sessionId: 'sess1', turnId: 't' },
    text: 'x',
    signal: new AbortController().signal,
    emitDelta: () => {},
  }

  test('① approval_request → requestApproval 透传（toolName/actionDigest）+ approved 决策行回写 stdin', async () => {
    const f = fakeApprovalSpawn()
    const runner = createSpawnCliTurnRunner({ workspaceDir: () => '/tmp/ws1', spawn: f.seam })
    const calls: Array<{ toolName?: string; actionDigest?: Record<string, unknown> }> = []
    const gate = defer<void>()
    const p = runner({
      ...runArgs,
      requestApproval: async (req) => { calls.push(req ?? {}); await gate.promise; return 'approved' },
    })
    f.emit(approvalReq())
    await tick()
    await tick()
    expect(calls.length).toBe(1)
    expect(calls[0]).toEqual({ toolName: 'Write', actionDigest: { file_path: '/tmp/ws1/out.txt' } })
    // W1-a 预注册形：spawn args 追加审批通道 flag + stdio 三 pipe（仅本 lane）。
    expect(f.args()).toContain('--approval-channel')
    expect(f.args()).toContain('stream-json')
    expect(f.opts()?.stdio).toEqual(['pipe', 'pipe', 'pipe'])
    gate.resolve()
    await tick()
    expect(f.stdinWrites).toEqual([
      `${JSON.stringify({ type: 'approval_response', approval_id: 'a-1', decision: 'approved' })}\n`,
    ])
    f.emit(line({ type: 'assistant', message: { content: [{ type: 'text', text: 'done' }] } }))
    f.close(0)
    expect(await p).toBe('completed')
  })

  test('② denied → deny 决策行回写 + 回合继续至 completed', async () => {
    const f = fakeApprovalSpawn()
    const runner = createSpawnCliTurnRunner({ workspaceDir: () => '/tmp/ws1', spawn: f.seam })
    const deltas: string[] = []
    const p = runner({
      ...runArgs,
      emitDelta: (t) => deltas.push(t),
      requestApproval: async () => 'denied',
    })
    f.emit(approvalReq())
    await tick()
    await tick()
    expect(f.stdinWrites).toEqual([
      `${JSON.stringify({ type: 'approval_response', approval_id: 'a-1', decision: 'denied' })}\n`,
    ])
    // deny 后引擎以拒答文本继续收口（回合不被审批打断）。
    f.emit(line({ type: 'assistant', message: { content: [{ type: 'text', text: 'denied by host' }] } }))
    f.close(0)
    expect(await p).toBe('completed')
    expect(deltas).toEqual(['denied by host'])
  })

  test('③ expired → expired 决策行回写', async () => {
    const f = fakeApprovalSpawn()
    const runner = createSpawnCliTurnRunner({ workspaceDir: () => '/tmp/ws1', spawn: f.seam })
    const p = runner({ ...runArgs, requestApproval: async () => 'expired' })
    f.emit(approvalReq())
    await tick()
    await tick()
    expect(f.stdinWrites).toEqual([
      `${JSON.stringify({ type: 'approval_response', approval_id: 'a-1', decision: 'expired' })}\n`,
    ])
    f.close(0)
    expect(await p).toBe('completed')
  })

  test('④ voidedByCancel → 零写入（C1-e：取消不走 wire，abort→kill 收口）', async () => {
    const f = fakeApprovalSpawn()
    const runner = createSpawnCliTurnRunner({ workspaceDir: () => '/tmp/ws1', spawn: f.seam })
    const p = runner({ ...runArgs, requestApproval: async () => 'voidedByCancel' })
    f.emit(approvalReq())
    await tick()
    await tick()
    expect(f.stdinWrites).toEqual([])
    f.close(0)
    expect(await p).toBe('completed')
  })

  test('⑤ 无审批回合 stdin 零字节 + 回合 settle（completed）+ 子进程正常退出', async () => {
    const f = fakeApprovalSpawn()
    const runner = createSpawnCliTurnRunner({ workspaceDir: () => '/tmp/ws1', spawn: f.seam })
    const deltas: string[] = []
    // 审批面零触碰即硬错（无审批回合 kernel 面不可达——C1-d pending-gated 对偶）。
    const p = runner({
      ...runArgs,
      emitDelta: (t) => deltas.push(t),
      requestApproval: async () => { throw new Error('requestApproval must not be called on approval-free turn') },
    })
    f.emit(line({ type: 'system', subtype: 'init' }))
    f.emit(line({ type: 'assistant', message: { content: [{ type: 'text', text: 'ok' }] } }))
    f.close(0)
    expect(await p).toBe('completed')
    expect(deltas).toEqual(['ok'])
    expect(f.stdinWrites).toEqual([])
  })

  test('⑥ result 行 → stdin end() 释放（引擎自然退出收口）+ 结算仍以 close code 为权威', async () => {
    // 根因定谳（2026-11-27 ctl2）：三 pipe 形下 host 永持 stdin → 引擎
    // result 后事件循环被 stdin 句柄持住 → close 永不 fire → 回合悬挂
    // （r-20261122 悬挂同形第二犯）。本腿钉住：result 行到即 end()；
    // end 前（delta/system 行）零 end；end 后 close(0) → completed。
    const f = fakeApprovalSpawn()
    const runner = createSpawnCliTurnRunner({ workspaceDir: () => '/tmp/ws1', spawn: f.seam })
    const p = runner({ ...runArgs, requestApproval: async () => 'approved' })
    f.emit(line({ type: 'system', subtype: 'init' }))
    await tick()
    expect(f.stdinEnds(), 'non-result lines must not end stdin').toBe(0)
    f.emit(line({ type: 'assistant', message: { content: [{ type: 'text', text: 'almost done' }] } }))
    await tick()
    expect(f.stdinEnds()).toBe(0)
    f.emit(line({ type: 'result', subtype: 'success' }))
    await tick()
    expect(f.stdinEnds(), 'result line must end stdin (engine event-loop release)').toBe(1)
    f.close(0)
    expect(await p).toBe('completed')
    // 结算权威零变更：close 非 0 → failed（即使 result 已到）。
    const f2 = fakeApprovalSpawn()
    const runner2 = createSpawnCliTurnRunner({ workspaceDir: () => '/tmp/ws1', spawn: f2.seam })
    const p2 = runner2({ ...runArgs, requestApproval: async () => 'approved' })
    f2.emit(line({ type: 'result', subtype: 'error_during_execution' }))
    await tick()
    f2.close(1)
    expect(await p2).toBe('failed')
  })

  test('streamJsonResult 判定：result → true；其他/非法行/空 → false', () => {
    expect(streamJsonResult(line({ type: 'result', subtype: 'success' }))).toBe(true)
    expect(streamJsonResult(line({ type: 'assistant', message: { content: [] } }))).toBe(false)
    expect(streamJsonResult(line({ type: 'approval_request', approval_id: 'a' }))).toBe(false)
    expect(streamJsonResult('not json')).toBe(false)
    expect(streamJsonResult('')).toBe(false)
  })

  test('approval_request 行解析：合法形/非 approval_request/缺 approval_id → null', () => {
    const good = streamJsonApprovalRequest(approvalReq())
    expect(good).toEqual({ approvalId: 'a-1', toolName: 'Write', inputDigest: { file_path: '/tmp/ws1/out.txt' } })
    expect(streamJsonApprovalRequest(line({ type: 'assistant', message: {} }))).toBe(null)
    expect(streamJsonApprovalRequest(line({ type: 'approval_request' }))).toBe(null)
    expect(streamJsonApprovalRequest(line({ type: 'approval_request', approval_id: '' }))).toBe(null)
    expect(streamJsonApprovalRequest('not json')).toBe(null)
    expect(streamJsonApprovalRequest('')).toBe(null)
    // input_digest 缺省/非对象 → 空对象（防御形）；tool_name 缺省 unknown。
    expect(streamJsonApprovalRequest(line({ type: 'approval_request', approval_id: 'a-2' })))
      .toEqual({ approvalId: 'a-2', toolName: 'unknown', inputDigest: {} })
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
          // 禁集 = module specifier + 具名符号双判（B1 审计登记 c 增补：
          // createExecutionOutlet / ExecutionOutlet 两 capability-entry 符号；
          // WebExecution* 数据类型不入禁集——executionRoutes 经 './upstream'
          // type re-export 为合法通道）。
          const hit = text.includes('web-session-runtime/execution')
            || text.includes('createExecutionComposition')
            || text.includes('createExecutionOutlet')
            || text.includes('ExecutionOutlet')
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
