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
 *    W1 接线（0.1.129 呈批书 §2，批复 @af5684e9）：runner 消费
 *    approval_request → deps.requestApproval（kernel 权威）→ 四值决策
 *    映射回写 stdin 决策行（voidedByCancel 零写入）；形 A 纪律 = host
 *    approvals 仅证据落档，decide 经 kernel，零 host 直通旁路。
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
  ExecutionReplay,
  WebExecutionCommand,
  WebExecutionEvent,
  WebExecutionError,
} from '@atlaswork/atlascode/web-session-runtime/execution'

/** spawn seam：注入供单测（真体 = node:child_process.spawn）。 */
export type SpawnSeam = (
  command: string,
  args: readonly string[],
  options: { cwd: string; signal?: AbortSignal; stdio?: ['pipe', 'pipe', 'pipe'] },
) => Pick<ChildProcess, 'stdout' | 'stderr' | 'stdin' | 'on'>

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
      // W1-a（0.1.129 呈批书 §2，批复 @af5684e9）：追加 --approval-channel=
      // stream-json —— ask 权限决断改走结构化 stdout 事件 + stdin 决策行
      // （C1 wire 形；禁复用 SDK control_request 面）。
      [
        '-p',
        deps.text,
        '--resume',
        deps.bind.sessionId,
        '--output-format',
        'stream-json',
        '--verbose',
        '--approval-channel',
        'stream-json',
      ],
      // W1-a：stdio 改三 pipe——stdin 'pipe' 供审批决策行回写。r-20261122
      // 悬挂定谳的兼容面（防悬挂）：引擎侧 stdin 启动 probe 有 3s peek 超时
      // 支（dispatch.ts getInputPrompt），零字节 pipe 不闭不悬挂；且决策写入
      // 仅在响应已发出的 approval_request 时发生（C1-d pending-gated 对偶，
      // 无审批回合 stdin 零字节）。
      { cwd: dir, signal: deps.signal, stdio: ['pipe', 'pipe', 'pipe'] },
    )
    // 子进程先死 + 迟到决策行写 → EPIPE 异步事件（uncaught 风险）；消费丢弃
    // ——kernel 已 settle（终态恰一个），决策行丢失方向 = 引擎收不到即
    // fail-closed deny（C1-e），无害。
    child.stdin?.on('error', () => {})
    // stdout 增量 → emitDelta（stream-json 按行解析 assistant text 块；
    // 非法行跳过——CLI stderr 混流不腐蚀回合记录）；approval_request 行
    // → kernel 审批链（W1-b：decide 经 kernel requestApproval 权威，runner
    // 只做 wire ↔ kernel 双向翻译，零 host 直通旁路）。
    const handleApprovalRequest = async (req: StreamJsonApprovalRequest): Promise<void> => {
      const decision = await deps.requestApproval({
        toolName: req.toolName,
        actionDigest: req.inputDigest,
      })
      // voidedByCancel（回合取消）不走 wire（C1-e）：零写入——引擎 abort→kill
      // 收口，EOF 即 fail-closed deny。
      if (decision === 'voidedByCancel') return
      const decisionLine = JSON.stringify({
        type: 'approval_response',
        approval_id: req.approvalId,
        decision,
      })
      child.stdin?.write(`${decisionLine}\n`)
    }
    let lineBuf = ''
    child.stdout?.on('data', (chunk: Buffer | string) => {
      lineBuf += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      let idx: number
      while ((idx = lineBuf.indexOf('\n')) >= 0) {
        const line = lineBuf.slice(0, idx)
        lineBuf = lineBuf.slice(idx + 1)
        const approvalReq = streamJsonApprovalRequest(line)
        if (approvalReq !== null) {
          void handleApprovalRequest(approvalReq)
          continue
        }
        const text = streamJsonTextDelta(line)
        if (text !== null) deps.emitDelta(text)
      }
    })
    // stderr 消费腿（终审 Issue 2）：--verbose 引擎 stderr 若只 pipe 不读，
    // node 运行时 >64KiB 产出塞满管道 → 子进程写阻塞 → close 永不 firing
    // → 回合悬挂（stdin 事故同形）。消费丢弃（协议面在 stdout；诊断转发
    // 候后续日志面切片）。
    child.stderr?.on('data', () => {})
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
/** 审批通道 wire 请求形（引擎 C1-c：approval_request 五字段的 runner 消费子集）。 */
export interface StreamJsonApprovalRequest {
  approvalId: string
  toolName: string
  inputDigest: Record<string, unknown>
}

/**
 * stream-json 单行 → approval_request（非审批请求行则 null）。
 * 形（引擎 C1-c 预注册）：{type:'approval_request', approval_id, tool_name,
 * input_digest, session_id}。防御解析：approval_id 缺失/空 → null（无法回写
 * 决策的请求行不触发 kernel 审批——kernel 权威，fail-closed）。
 */
export function streamJsonApprovalRequest(line: string): StreamJsonApprovalRequest | null {
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
  if (rec.type !== 'approval_request') return null
  if (typeof rec.approval_id !== 'string' || rec.approval_id.length === 0) return null
  const inputDigest =
    typeof rec.input_digest === 'object' && rec.input_digest !== null && !Array.isArray(rec.input_digest)
      ? (rec.input_digest as Record<string, unknown>)
      : {}
  return {
    approvalId: rec.approval_id,
    toolName: typeof rec.tool_name === 'string' ? rec.tool_name : 'unknown',
    inputDigest,
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
