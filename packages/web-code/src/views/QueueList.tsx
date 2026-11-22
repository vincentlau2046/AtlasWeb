// B 附表 §3 —— 队列读投影视图：running/queued 只读展示 + 取消/移除按钮。
// 纯投影零执法：状态机在上游内核，按钮只发命令（cancel/remove → kernel
// 落 cancelled 终态，不静默移除）。空队列零渲染。
export interface QueueListProps {
  runningTurnId: string | null
  queuedTurnIds: readonly string[]
  onCancel?: (turnId: string) => void
  onRemove?: (turnId: string) => void
}

export function QueueList({ runningTurnId, queuedTurnIds, onCancel, onRemove }: QueueListProps) {
  if (runningTurnId === null && queuedTurnIds.length === 0) return null
  return (
    <div className='webcode-exec-queue' data-exec-queue>
      {runningTurnId !== null && (
        <div className='webcode-exec-queue-running' data-exec-running={runningTurnId}>
          <span>running: {runningTurnId}</span>
          {onCancel !== undefined && (
            <button type='button' data-exec-cancel={runningTurnId} onClick={() => onCancel(runningTurnId)}>取消</button>
          )}
        </div>
      )}
      {queuedTurnIds.map(turnId => (
        <div className='webcode-exec-queue-row' key={turnId} data-exec-queued={turnId}>
          <span>queued: {turnId}</span>
          {onRemove !== undefined && (
            <button type='button' data-exec-remove={turnId} onClick={() => onRemove(turnId)}>移除</button>
          )}
        </div>
      ))}
    </div>
  )
}
