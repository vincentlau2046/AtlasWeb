/**
 * B 附表 §3 —— 队列读投影（queue projection）。
 *
 * 设计约束：
 *  - 纯投影：FIFO 状态机（深度 16 / 并发 1 / 真取消）全归上游 kernel
 *    （executionKernel.ts pump/cancel 臂），本件零执法、零写路径——只把
 *    turn.accepted/started/终态事件收敛为 UI 可读快照（§6「SSE 仅是视图，
 *    持久化回读为准」的前端只读投影半）。
 *  - 事件 bind 唯一权威：workspaceId/sessionId/turnId 全取信封 bind，
 *    不做跨 session 推断；turn.accepted 即入队（kernel 在 accepted 时已
 *    分配 turnId，queue.remove 可直接瞄准 queued 项）。
 *  - 终态恰一个：completed/failed/cancelled 均从队列出列并从 running 槽
 *    清位（重复终态事件幂等——投影允许多余终态不产生第二效果）。
 *
 * 类型面经 upstream 薄适配 re-export 取（单接触点纪律，§1）。
 */
import type { WebExecutionEvent } from './upstream'

export interface ExecutionQueueSnapshot {
  workspaceId: string
  sessionId: string
  /** 当前运行回合（null = 空闲；并发 1 归上游执法）。 */
  runningTurnId: string | null
  /** FIFO 等待序列（队首在前；不含运行项）。 */
  queuedTurnIds: string[]
  /** 上游锁定容量（呈现面用；越界拒收归 kernel）。 */
  capacity: number
}

interface SessionQueueState {
  running: string | null
  queued: string[]
}

export function createQueueProjection(options: { capacity?: number } = {}): {
  apply: (event: WebExecutionEvent) => void
  snapshot: (workspaceId: string, sessionId: string) => ExecutionQueueSnapshot
} {
  const capacity = options.capacity ?? 16
  const states = new Map<string, SessionQueueState>()

  const stateOf = (workspaceId: string, sessionId: string): SessionQueueState => {
    const key = `${workspaceId}\u0000${sessionId}`
    let state = states.get(key)
    if (state === undefined) {
      state = { running: null, queued: [] }
      states.set(key, state)
    }
    return state
  }

  return {
    apply(event) {
      if (event === null || typeof event !== 'object') return
      const bind = (event as { bind?: { workspaceId?: unknown; sessionId?: unknown; turnId?: unknown } }).bind
      if (bind === undefined || typeof bind !== 'object') return
      const workspaceId = bind.workspaceId
      const sessionId = bind.sessionId
      if (typeof workspaceId !== 'string' || workspaceId.length === 0) return
      if (typeof sessionId !== 'string' || sessionId.length === 0) return
      const turnId = typeof bind.turnId === 'string' ? bind.turnId : ''
      const state = stateOf(workspaceId, sessionId)
      switch ((event as { type?: unknown }).type) {
        case 'turn.accepted':
          if (turnId !== '' && state.running !== turnId && !state.queued.includes(turnId)) {
            state.queued.push(turnId)
          }
          return
        case 'turn.started':
          if (turnId !== '') {
            state.queued = state.queued.filter(id => id !== turnId)
            state.running = turnId
          }
          return
        case 'turn.completed':
        case 'turn.failed':
        case 'turn.cancelled':
          if (turnId !== '') {
            state.queued = state.queued.filter(id => id !== turnId)
            if (state.running === turnId) state.running = null
          }
          return
        default:
          return
      }
    },
    snapshot(workspaceId, sessionId) {
      const state = states.get(`${workspaceId}\u0000${sessionId}`)
      return {
        workspaceId,
        sessionId,
        runningTurnId: state?.running ?? null,
        queuedTurnIds: state === undefined ? [] : [...state.queued],
        capacity,
      }
    },
  }
}