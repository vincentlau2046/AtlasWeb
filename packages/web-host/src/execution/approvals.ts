/**
 * B 附表 §3 —— 审批证据落档（approval evidence store）。
 *
 * 合同 §5「服务端唯一裁判」在本拓扑的落点：浏览器连接终结在 host，kernel
 * 不可见浏览器身份。本件是**纯证据落档件，不自裁**：
 *  - 证据七字段逐字段锁定：{ workspaceId, sessionId, turnId, approvalId,
 *    decision, actorId, timestamp }。actorId/timestamp 由上游 kernel 在
 *    approval.settled 事件上抛（kernel options.actorId() = host 注入的已
 *    认证连接身份；now() = 服务端时钟），本件只落档不产值——客户端自报
 *    主体/时间无写入路径（POST command 面 schema strictObject 已拒多余字段）。
 *  - 不记录正文、令牌、待批内容：只存上述七字段，事件 payload 其余字段
 *    零透传。
 *  - 有效决定恰一个（§4）：同 approvalId 二次 settled 事件忽略（kernel
 *    侧已由 settleApproval 幂等门执法，本件为互证层的 defense-in-depth）。
 *  - 保留期限 = 与该 turn 记录同生命周期：不设主动清扫；turn 记录删除的
 *    未来面经 dropTurn(workspaceId, sessionId, turnId) 显式缝（当前零调用）。
 *  - 访问仅服务端证据查询（bind 限定本 workspace）：query 按 workspaceId
 *    强制过滤，无跨域读路径。
 *  - 与 kernel 决策结果可互证（E5）：落档值直接取 kernel 事件，不重算、
 *    不改写；查询面按 (turnId, approvalId) 可对表磁盘实际结果。
 *
 * 类型面经 upstream 薄适配 re-export 取（单接触点纪律，§1）。
 */
import type { WebExecutionEvent } from './upstream'

export const APPROVAL_DECISIONS = ['approved', 'denied', 'expired', 'voidedByCancel'] as const
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number]

/** 证据七字段（合同 §5 逐字段锁定；零扩展字段）。 */
export interface ApprovalEvidence {
  workspaceId: string
  sessionId: string
  turnId: string
  approvalId: string
  decision: ApprovalDecision
  actorId: string
  timestamp: number
}

const DECISION_SET: ReadonlySet<string> = new Set(APPROVAL_DECISIONS)
const keyOf = (workspaceId: string, sessionId: string, approvalId: string): string =>
  `${workspaceId}\u0000${sessionId}\u0000${approvalId}`

export function createApprovalEvidenceStore(): {
  /** 事件收敛入口（由 host 组合根挂到 upstream.onEvent；非事件/不完整 → 零记录）。 */
  apply: (event: WebExecutionEvent) => void
  /** 服务端证据查询（workspace 强制限定；可按 session/turn 过滤；只读副本）。 */
  query: (workspaceId: string, filter?: { sessionId?: string; turnId?: string }) => ApprovalEvidence[]
  /** turn 记录删除伴随缝（保留期限 = turn 同生命周期；当前零调用）。 */
  dropTurn: (workspaceId: string, sessionId: string, turnId: string) => number
} {
  const records = new Map<string, ApprovalEvidence>()

  const apply = (event: WebExecutionEvent): void => {
    if (event === null || typeof event !== 'object') return
    const candidate = event as {
      type?: unknown
      bind?: { workspaceId?: unknown; sessionId?: unknown; turnId?: unknown }
      payload?: { approvalId?: unknown; decision?: unknown; actorId?: unknown; timestamp?: unknown }
    }
    if (candidate.type !== 'approval.settled') return
    const bind = candidate.bind
    const payload = candidate.payload
    if (bind === undefined || payload === undefined) return
    const workspaceId = bind.workspaceId
    const sessionId = bind.sessionId
    const turnId = bind.turnId
    const approvalId = payload.approvalId
    const decision = payload.decision
    const actorId = payload.actorId
    const timestamp = payload.timestamp
    // 七字段完整性 fail-closed：任一缺失/形态不符 → 零记录（不落残缺证据）。
    if (typeof workspaceId !== 'string' || workspaceId.length === 0) return
    if (typeof sessionId !== 'string' || sessionId.length === 0) return
    if (typeof turnId !== 'string' || turnId.length === 0) return
    if (typeof approvalId !== 'string' || approvalId.length === 0) return
    if (typeof decision !== 'string' || !DECISION_SET.has(decision)) return
    if (typeof actorId !== 'string' || actorId.length === 0) return
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return
    const key = keyOf(workspaceId, sessionId, approvalId)
    if (records.has(key)) return // 有效决定恰一个（互证层 defense-in-depth）
    records.set(key, {
      workspaceId,
      sessionId,
      turnId,
      approvalId,
      decision: decision as ApprovalDecision,
      actorId,
      timestamp,
    })
  }

  return {
    apply,
    query(workspaceId, filter = {}) {
      const out: ApprovalEvidence[] = []
      for (const record of records.values()) {
        if (record.workspaceId !== workspaceId) continue // 服务端查询限定本 workspace
        if (filter.sessionId !== undefined && record.sessionId !== filter.sessionId) continue
        if (filter.turnId !== undefined && record.turnId !== filter.turnId) continue
        out.push({ ...record })
      }
      out.sort((a, b) => a.timestamp - b.timestamp)
      return out
    },
    dropTurn(workspaceId, sessionId, turnId) {
      let dropped = 0
      for (const [key, record] of records) {
        if (record.workspaceId === workspaceId && record.sessionId === sessionId && record.turnId === turnId) {
          records.delete(key)
          dropped += 1
        }
      }
      return dropped
    },
  }
}