// B3（工单 docs/2026-11-27-b3-deliverables-status-settings-wave.md R-B3-1）——
// 产品状态条：执行通道真实投影（phase/running/pending/stream+command error），
// 挂 shell.bottom 单槽，仅 execution 通道注入时由 apply 注册（只读模式零渲染）。
// 纯投影零执法：状态机在上游 ExecutionController。
import type { ExecutionStatusModel } from '../execution/executionController.ts'

export interface StatusStripProps {
  status: ExecutionStatusModel
}

export function StatusStrip({ status }: StatusStripProps) {
  const { phase, error, streamError, queue, pendingApprovals } = status
  return (
    <div className='webcode-exec-status-strip' data-status-strip data-strip-phase={phase}>
      <span className='webcode-exec-status-phase'>status: {phase}</span>
      {queue.runningTurnId !== null && (
        <span data-strip-running={queue.runningTurnId}>running: {queue.runningTurnId}</span>
      )}
      {queue.queuedTurnIds.length > 0 && (
        <span data-strip-queued={queue.queuedTurnIds.length}>queued: {queue.queuedTurnIds.length}</span>
      )}
      {pendingApprovals.length > 0 && (
        <span data-strip-pending={pendingApprovals.length}>待批: {pendingApprovals.length}</span>
      )}
      {streamError !== undefined && (
        <span data-strip-stream-error={streamError.code}>stream error: {streamError.message}</span>
      )}
      {error !== undefined && (
        <span data-strip-error={error.code}>error: {error.message}</span>
      )}
    </div>
  )
}
