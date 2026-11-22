/**
 * B 附表 §3 —— executionRoutes（POST 路由域，auth fence 之后由 httpHost
 * 挂载；bind 三元组 host 侧先校验再入 upstream，E2）。
 *
 * 职责边界：
 *  - capability.probe（合同 §2 命令 1）：仅需连接级鉴权（httpHost fence +
 *    cookie 已在上游完成），泄露面仅 on/off + 受支持 v。
 *  - 五写命令 host 侧预校验：bind 三元组形态（非空字符串）+ workspaceId
 *    授权对表（E1：无授权 turn.submit 拒且 upstream 零触达——引擎零启动
 *    语义由「未授权 = 不构造 upstream」+ 本预校验双层承载）。
 *  - 上限执法归上游 kernel（合同 §8），本域零重复执法，仅映射边界错误码
 *    到 HTTP status（呈现面）。
 *  - 组合根恰一次（§7 对表腿）：同一 upstream 实例二次注入本域 = 硬错
 *    （WeakSet 守卫；重复注入 workspaceAuth 面在 upstream 构造侧同守卫）。
 *
 * B2 追加（附表 §3）：
 *  - 事件单 tap：构造期对 kernel onEvent 挂**一个**监听，扇出到队列投影
 *    （queue.ts）/ 证据落档（approvals.ts）/ 本域订阅者（SSE 面）。零第二
 *    订阅路径，kernel 事件流唯一点。
 *  - 只读查询面：queueSnapshot / approvalEvidence（workspace 强制限定）/
 *    replay（kernel replaySince 透传，三态原样）。
 *  - dispose：释放 tap（测试与热替换用；host 生命周期内零调用）。
 *
 * 零外部依赖；零副作用 at import。
 */
// 单接触点纪律（§1）：类型面经 upstream 薄适配 re-export 取，子路径
// specifier 仅 upstream.ts 一处（自动执法腿机器判）。
import type { ExecutionReplay, WebExecutionCommand, WebExecutionEvent, WebExecutionError } from './upstream'
import type { ExecutionUpstream } from './upstream'
import type { WorkspaceAuthorizer } from './workspaceAuth'
import { createQueueProjection, type ExecutionQueueSnapshot } from './queue'
import { createApprovalEvidenceStore, type ApprovalDecision, type ApprovalEvidence } from './approvals'

/** 五写命令（capability.probe 由 probe() 承载，不经 kernel）。 */
const WRITE_COMMAND_TYPES = ['turn.submit', 'turn.cancel', 'queue.remove', 'approval.decide', 'follow.resume'] as const
export type WriteCommandType = (typeof WRITE_COMMAND_TYPES)[number]

export interface ExecutionRoutesOptions {
  upstream: ExecutionUpstream
  workspaceAuth: WorkspaceAuthorizer
  /** 注入面（单测 / 组合根共享）；缺省 = 本域内构造。 */
  queue?: ReturnType<typeof createQueueProjection>
  evidence?: ReturnType<typeof createApprovalEvidenceStore>
}

export interface ExecutionDispatchResult {
  status: number
  body: WebExecutionEvent | (WebExecutionError & { httpStatusHint?: never }) | { error: string; code: string }
}

export interface ExecutionRoutes {
  probe: () => { enabled: boolean; supportedV: number }
  dispatch: (command: WebExecutionCommand) => Promise<ExecutionDispatchResult>
  /** B2 队列读投影（纯投影，零执法）。 */
  queueSnapshot: (workspaceId: string, sessionId: string) => ExecutionQueueSnapshot
  /** B2 审批证据查询（服务端面；workspace 强制限定）。 */
  approvalEvidence: (workspaceId: string, filter?: { sessionId?: string; turnId?: string }) => ApprovalEvidence[]
  /** B2 事件回放（kernel replaySince 三态透传：baseline/delta/expired）。 */
  replay: (workspaceId: string, sessionId: string, cursor?: string) => ExecutionReplay
  /** B2 事件流订阅（单一 kernel tap 的扇出面；返回退订）。 */
  subscribe: (listener: (event: WebExecutionEvent) => void) => () => void
  /** 释放 kernel tap（host 生命周期内零调用；测试收尾用）。 */
  dispose: () => void
}

const mountedUpstreams = new WeakSet<object>()

/** kernel 边界错误码 → HTTP status（呈现面映射；零执法语义）。 */
export function errorStatus(code: string): number {
  switch (code) {
    case 'invalidBind': return 400
    case 'notFound': return 404
    case 'approvalBindMismatch': return 403
    case 'alreadySettled': return 409
    case 'queueFull': return 429
    case 'resourceLimit': return 429
    case 'notImplemented': return 501
    default: return 400
  }
}

export function createExecutionRoutes(options: ExecutionRoutesOptions): ExecutionRoutes {
  if (mountedUpstreams.has(options.upstream as unknown as object)) {
    throw new Error('execution upstream already mounted into a route set (§7 组合根恰一次)')
  }
  mountedUpstreams.add(options.upstream as unknown as object)
  if (typeof options.workspaceAuth?.isGranted !== 'function') {
    throw new Error('workspaceAuth authorizer is required (bind workspaceId grant check, E1/E2)')
  }

  const queue = options.queue ?? createQueueProjection()
  const evidence = options.evidence ?? createApprovalEvidenceStore()
  const listeners = new Set<(event: WebExecutionEvent) => void>()
  // 事件单 tap：投影/证据/订阅者全部经此扇出（kernel 订阅恰一个）。
  const offKernel = options.upstream.onEvent((event) => {
    queue.apply(event)
    evidence.apply(event)
    for (const listener of [...listeners]) {
      try {
        listener(event)
      } catch {
        // 订阅者异常不腐蚀其余扇出面（SSE 写入面自带终流处置）。
      }
    }
  })

  /** E1/E2 host 侧预校验：bind 形态 + 授权对表；拒且 upstream 零触达。 */
  const bindPrecheck = (command: WebExecutionCommand): { code: string; message: string } | null => {
    const ws = command?.bind?.workspaceId
    const s = command?.bind?.sessionId
    if (typeof ws !== 'string' || ws.length === 0 || typeof s !== 'string' || s.length === 0) {
      return { code: 'invalidBind', message: 'bind.workspaceId/bind.sessionId must be non-empty strings' }
    }
    if (!options.workspaceAuth.isGranted(ws)) {
      return { code: 'workspaceNotGranted', message: `workspace "${ws}" is not granted for execution` }
    }
    return null
  }

  return {
    probe: () => ({ enabled: true, supportedV: 0 }),
    dispatch: async (command) => {
      if (typeof command?.type !== 'string' || !(WRITE_COMMAND_TYPES as readonly string[]).includes(command.type)) {
        return {
          status: 400,
          body: { code: 'invalidCommand', message: `unsupported execution command type: ${String(command?.type)}`, retryable: false },
        }
      }
      const pre = bindPrecheck(command)
      if (pre !== null) {
        return { status: pre.code === 'workspaceNotGranted' ? 403 : 400, body: { code: pre.code, message: pre.message, retryable: false } }
      }
      const result = await options.upstream.handleCommand(command)
      if ('type' in result) return { status: 200, body: result } // WebExecutionEvent
      return { status: errorStatus(result.code), body: result } // WebExecutionError
    },
    queueSnapshot: (workspaceId, sessionId) => queue.snapshot(workspaceId, sessionId),
    approvalEvidence: (workspaceId, filter) => evidence.query(workspaceId, filter),
    replay: (workspaceId, sessionId, cursor) => options.upstream.replaySince(workspaceId, sessionId, cursor),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    dispose: () => {
      offKernel()
      listeners.clear()
    },
  }
}

/** 供 httpHost 复用的决策集（查询面过滤参数校验用）。 */
export type { ApprovalDecision }