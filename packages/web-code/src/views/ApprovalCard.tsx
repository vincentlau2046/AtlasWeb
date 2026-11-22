// B 附表 §3 —— 待批审批卡：批准/拒绝两按钮。决定经 kernel（approval.decide，
// bind ≡ 归属 turn 由控制器保证）；卡片只发命令，零本地判定。
export type ApprovalCardDecision = 'approved' | 'denied'

export interface ApprovalCardProps {
  approvalId: string
  turnId: string
  onDecide: (approvalId: string, decision: ApprovalCardDecision) => void
}

export function ApprovalCard({ approvalId, turnId, onDecide }: ApprovalCardProps) {
  return (
    <div className='webcode-exec-approval' data-exec-approval={approvalId} data-exec-approval-turn={turnId}>
      <span>待审批 {approvalId}（turn {turnId}）</span>
      <button type='button' data-exec-approve={approvalId} onClick={() => onDecide(approvalId, 'approved')}>批准</button>
      <button type='button' data-exec-deny={approvalId} onClick={() => onDecide(approvalId, 'denied')}>拒绝</button>
    </div>
  )
}
