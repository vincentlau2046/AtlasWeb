/**
 * B 附表 §1/§2 —— upstream（ExecutionUpstream 薄适配 + spawnCliTurnRunner
 * 真体，f4 裁定 e429130 用户裁定形 + F2 actorId fail-closed）。
 *
 * **单接触点纪律（B 附表 §1，GREEN 自动执法腿机器判）**：本文件是全仓唯一
 * import `@atlaswork/atlascode/web-session-runtime/execution`（execution
 * 出口 module specifier + 具名符号双判）之处；其余文件只经本件薄适配面。
 *
 * runTurn 真体形（用户裁定 2026-11-21 e429130）：
 *  - spawn 已发布 `atlas -p <text> --resume <sessionId>` 子进程
 *    （cwd = 授权 workspace 目录）；stdout 增量 → deps.emitDelta（kernel
 *    emit 权威，stream-json 结构化协议按行解析 assistant text 块）。
 *  - signal → kill 子进程（引擎真中止）→ 'cancelled'；exit 0 →
 *    'completed'；非 0 → 'failed'。spawn seam 注入供单测。
 *  - B2 审批链路必须经 kernel（禁复用 CLI control-request 审批面）——
 *    B1 切片 runner 不消费 requestApproval（kernel 面保留；B2 接线）。
 *  - actorId() 真源 = host 已认证连接身份注入（**必填 fail-closed**：
 *    缺失/空值构造即硬错，不回落 ambient——F2 裁定，'atlas-local-ambient'
 *    仅 CLI 车道零参默认，web 车道不可见）。
 *
 * 组合根恰一次（§7 AtlasWeb 侧对表腿）：同一 workspaceAuthorizer / 同一
 * composition 注入二次构造 = 硬错（WeakSet 守卫）。
 *
 * 上限执法归上游 kernel（合同 §8），本件零重复执法，仅透传边界错误码。
 * 零副作用 at import。
 */
import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process'
import {
  createExecutionComposition,
  type ExecutionComposition,
  type ExecutionReplay,
  type ExecutionTurnOutcome,
  type ExecutionTurnRunner,
  type WebExecutionCommand,
  type WebExecutionEvent,
  type WebExecutionError,
} from '@atlaswork/atlascode/web-session-runtime/execution'
import type { WorkspaceAuthorizer } from './workspaceAuth'

/** execution 出口事件/错误并型（合同 §2 事件流唯一形态）。 */
export type ExecutionResult = WebExecutionEvent | WebExecutionError
/** 单接触点纪律（§1）：仓内其余域的类型面一律经本薄适配取（re-export），子路径 specifier 不外溢。 */
export type {
  WebExecutionCommand,
  WebExecutionEvent,
  WebExecutionError,
} from '@atlaswork/atlascode/web-session-runtime/execution'

/** spawn seam：注入供单测（真体 = node:child_process.spawn）。 */
export type SpawnSeam = (
  command: string,
  args: readonly string[],
  options: { cwd: string; signal?: AbortSignal },
) => Pick<ChildProcess, 'stdout' | 'stderr' | 'on'>

export interface ExecutionUpstream {
  /** 合同 §2 六命令一一对应（capability.probe 由 routes 域承载，不经 kernel）。 */
  handleCommand(command: WebExecutionCommand): Promise<ExecutionResult>
  /** 事件流订阅（kernel onEvent 权威透传）。 */
  onEvent(cb: (e: WebExecutionEvent) => void): () => void
  /** §6 恢复原语（kernel replaySince 透传）。 */
  replaySince(workspaceId: string, sessionId: string, cursor?: string): ExecutionReplay
}

export interface ExecutionUpstreamOptions {
  /** 已认证连接身份真源（§5：actorId 服务端解析）——必填 fail-closed（F2）。 */
  actorId: () => string
  /** 授权工作区目录解析（runTurn cwd 消费面；workspaceAuth.workspaceDir）。 */
  workspaceDir: (workspaceId: string) => string | undefined
  /** spawn seam（单测注入；缺省 = node:child_process.spawn 真体）。 */
  spawn?: SpawnSeam
  /** CLI bin（缺省 'atlas' = 已发布面）。 */
  cliPath?: string
  /** 服务端时钟（测试注入；透传 kernel §5）。 */
  now?: () => number
  /** runTurn 覆盖注入（单测；缺省 = spawnCliTurnRunner 真体）。 */
  runTurn?: ExecutionTurnRunner
}

/** 组合根恰一次守卫：同 authorizer/composition 二次注入 = 硬错。 */
const mountedAuthorizers = new WeakSet<object>()

/**
 * spawnCliTurnRunner 真体工厂（e429130 形）。返回 ExecutionTurnRunner 供
 * createExecutionComposition 注入。
 */
export function createSpawnCliTurnRunner(options: {
  workspaceDir: (workspaceId: string) => string | undefined
  spawn?: SpawnSeam
  cliPath?: string
}): ExecutionTurnRunner {
  const doSpawn = options.spawn ?? nodeSpawn
  const cliPath = options.cliPath ?? 'atlas'
  return async (deps): Promise<ExecutionTurnOutcome> => {
    const dir = options.workspaceDir(deps.bind.workspaceId)
    if (dir === undefined) {
      throw new Error(`workspace "${deps.bind.workspaceId}" not granted (runTurn cwd unresolvable)`)
    }
    const child = doSpawn(
      cliPath,
      ['-p', deps.text, '--resume', deps.bind.sessionId],
      { cwd: dir, signal: deps.signal },
    )
    // stdout 增量 → emitDelta（stream-json 按行解析 assistant text 块；
    // 非法行跳过——CLI stderr 混流不腐蚀回合记录）。
    let lineBuf = ''
    child.stdout?.on('data', (chunk: Buffer | string) => {
      lineBuf += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      let idx: number
      while ((idx = lineBuf.indexOf('\n')) >= 0) {
        const line = lineBuf.slice(0, idx)
        lineBuf = lineBuf.slice(idx + 1)
        const text = streamJsonTextDelta(line)
        if (text !== null) deps.emitDelta(text)
      }
    })
    // signal → kill（引擎真中止）；runner 返回 'cancelled'（终态以 kernel
    // settleTurn 为准，恰一个）。
    const onAbort = (): void => {
      child.kill?.()
    }
    deps.signal.addEventListener('abort', onAbort, { once: true })
    const exitCode = await new Promise<number | null>((resolve) => {
      child.on('close', (code) => resolve(code))
      child.on('error', () => resolve(-1))
    })
    deps.signal.removeEventListener('abort', onAbort)
    if (deps.signal.aborted) return 'cancelled'
    return exitCode === 0 ? 'completed' : 'failed'
  }
}

/**
 * stream-json 单行 → assistant text 增量（无增量则 null）。
 * 形：{type:'assistant', message:{content:[{type:'text',text:'…'}]}}。
 * 结构化协议边界注记（合同 §9）：text 块按块发射；其余类型（tool_use 等）
 * B1 不投影。
 */
export function streamJsonTextDelta(line: string): string | null {
  const trimmed = line.trim()
  if (trimmed.length === 0) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const rec = parsed as Record<string, unknown>
  if (rec.type !== 'assistant') return null
  const message = rec.message as Record<string, unknown> | undefined
  const content = message?.content
  if (!Array.isArray(content)) return null
  const texts: string[] = []
  for (const block of content) {
    if (typeof block === 'object' && block !== null) {
      const b = block as Record<string, unknown>
      if (b.type === 'text' && typeof b.text === 'string' && b.text.length > 0) texts.push(b.text)
    }
  }
  return texts.length > 0 ? texts.join('') : null
}

/**
 * ExecutionUpstream 薄适配构造（单接触点）。actorId 必填 fail-closed
 * （F2）；组合根恰一次（§7）。
 */
export function createExecutionUpstream(options: ExecutionUpstreamOptions): ExecutionUpstream {
  if (typeof options?.actorId !== 'function') {
    throw new Error('actorId provider is required (web lane fail-closed, F2) — ambient fallback is CLI-lane only')
  }
  let probe: string
  try {
    probe = options.actorId()
  } catch (e) {
    throw new Error(`actorId provider must resolve the authenticated connection identity: ${(e as Error).message}`)
  }
  if (typeof probe !== 'string' || probe.length === 0) {
    throw new Error('actorId() must return a non-empty string (web lane fail-closed, F2)')
  }
  if (typeof options?.workspaceDir !== 'function') {
    throw new Error('workspaceDir resolver is required (runTurn cwd = authorized workspace dir)')
  }
  if (mountedAuthorizers.has(options)) {
    throw new Error('execution upstream already mounted for this identity (§7 组合根恰一次)')
  }
  mountedAuthorizers.add(options)

  const runTurn = options.runTurn ?? createSpawnCliTurnRunner({
    workspaceDir: options.workspaceDir,
    ...(options.spawn !== undefined ? { spawn: options.spawn } : {}),
    ...(options.cliPath !== undefined ? { cliPath: options.cliPath } : {}),
  })
  const composition: ExecutionComposition = createExecutionComposition({
    runTurn,
    actorId: options.actorId,
    ...(options.now !== undefined ? { now: options.now } : {}),
  })
  return {
    handleCommand: (command) => composition.kernel.handleCommand(command),
    onEvent: (cb) => composition.kernel.onEvent(cb),
    replaySince: (ws, sess, cursor) => composition.kernel.replaySince(ws, sess, cursor),
  }
}
