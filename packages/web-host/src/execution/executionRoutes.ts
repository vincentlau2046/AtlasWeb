/**
 * B 附表 §1 —— executionRoutes（POST 路由域，auth fence 之后由 httpHost
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
 * 零外部依赖；零副作用 at import。
 */
// 单接触点纪律（§1）：类型面经 upstream 薄适配 re-export 取，子路径
// specifier 仅 upstream.ts 一处（自动执法腿机器判）。
import type { WebExecutionCommand, WebExecutionEvent, WebExecutionError } from './upstream'
import type { ExecutionUpstream } from './upstream'
import type { WorkspaceAuthorizer } from './workspaceAuth'

/** 五写命令（capability.probe 由 probe() 承载，不经 kernel）。 */
const WRITE_COMMAND_TYPES = ['turn.submit', 'turn.cancel', 'queue.remove', 'approval.decide', 'follow.resume'] as const
export type WriteCommandType = (typeof WRITE_COMMAND_TYPES)[number]

export interface ExecutionRoutesOptions {
  upstream: ExecutionUpstream
  workspaceAuth: WorkspaceAuthorizer
}

export interface ExecutionDispatchResult {
  status: number
  body: WebExecutionEvent | (WebExecutionError & { httpStatusHint?: never }) | { error: string; code: string }
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

export function createExecutionRoutes(options: ExecutionRoutesOptions): {
  probe: () => { enabled: boolean; supportedV: number }
  dispatch: (command: WebExecutionCommand) => Promise<ExecutionDispatchResult>
} {
  if (mountedUpstreams.has(options.upstream as unknown as object)) {
    throw new Error('execution upstream already mounted into a route set (§7 组合根恰一次)')
  }
  mountedUpstreams.add(options.upstream as unknown as object)
  if (typeof options.workspaceAuth?.isGranted !== 'function') {
    throw new Error('workspaceAuth authorizer is required (bind workspaceId grant check, E1/E2)')
  }

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
  }
}
