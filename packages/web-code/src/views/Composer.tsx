// B 附表 §3 —— 执行面 Composer：输入 + 排队区（QueueList）+ 待批卡
// （ApprovalCard）+ settled 展示（actorId 取自 approval.settled 事件）。
// gate：probe ≠ ready 时零渲染（合同 §10：能力关闭 = 纯只读，不是
// disabled 占位）。
import { useState } from 'react'
import { QueueList } from './QueueList.tsx'
import { ApprovalCard, type ApprovalCardDecision } from './ApprovalCard.tsx'
import type { ExecutionPhase, ExecutionStatusModel } from '../execution/executionController.ts'

export interface ComposerProps {
  phase: ExecutionPhase
  queue: ExecutionStatusModel['queue']
  pendingApprovals: ExecutionStatusModel['pendingApprovals']
  settledApprovals: ExecutionStatusModel['settledApprovals']
  onSubmit: (text: string) => void
  onCancel: (turnId: string) => void
  onRemove: (turnId: string) => void
  onDecide: (approvalId: string, decision: ApprovalCardDecision) => void
}

export function Composer({ phase, queue, pendingApprovals, settledApprovals, onSubmit, onCancel, onRemove, onDecide }: ComposerProps) {
  // probe=off / disabled / error / probing → 零渲染（执行面不存在，非禁用态）。
  if (phase !== 'ready') return null
  return (
    <div className='webcode-exec-composer' data-exec-composer>
      <QueueList runningTurnId={queue.runningTurnId} queuedTurnIds={queue.queuedTurnIds} onCancel={onCancel} onRemove={onRemove} />
      {pendingApprovals.map(approval => (
        <ApprovalCard key={approval.approvalId} approvalId={approval.approvalId} turnId={approval.turnId} onDecide={onDecide} />
      ))}
      {settledApprovals.map(entry => (
        <div className='webcode-exec-settled' key={entry.approvalId} data-exec-settled={entry.approvalId}>
          {entry.approvalId} → {entry.decision}（actor {entry.actorId}）
        </div>
      ))}
      <ComposerInput onSubmit={onSubmit} />
    </div>
  )
}

function ComposerInput({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [text, setText] = useState('')
  return (
    <form
      className='webcode-exec-composer-input'
      onSubmit={event => {
        event.preventDefault()
        const trimmed = text.trim()
        if (trimmed.length === 0) return
        onSubmit(trimmed)
        setText('')
      }}
    >
      <input
        type='text'
        value={text}
        data-exec-input
        onChange={event => { setText(event.target.value) }}
        placeholder='向工作区发送回合…'
      />
      <button type='submit' data-exec-submit>发送</button>
    </form>
  )
}
