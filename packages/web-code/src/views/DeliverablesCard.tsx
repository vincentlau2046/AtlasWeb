// B3（工单 §R-B3-2，F8 不造假条款）——交付物卡：只基于 ConversationModel
// 真实内核输出（activity 块计数 + 最近 assistant 文本尾部）的「转录推导」面。
// 载体无 files/deliverables 读取 API（工单 §4 差异登记）——卡面自陈推导来源，
// 不虚构文件清单；文件级交付面登记后续波候选。
import type { ConversationModel } from '../projection.ts'

export interface DeliverablesCardProps {
  conversation: ConversationModel
}

/** Summary excerpt cap（尾部截取，避免长终端文本撑爆卡面）。 */
const SUMMARY_TAIL_CHARS = 240

export function DeliverablesCard({ conversation }: DeliverablesCardProps) {
  if (conversation.messages.length === 0) return null
  let activityCount = 0
  let lastAssistantText: string | null = null
  for (const message of conversation.messages) {
    for (const block of message.blocks) {
      if (block.kind === 'activity') activityCount += 1
      if (message.role === 'assistant' && block.kind === 'text' && block.text.trim().length > 0) {
        lastAssistantText = block.text
      }
    }
  }
  const summary = lastAssistantText === null
    ? null
    : lastAssistantText.length > SUMMARY_TAIL_CHARS
      ? '…' + lastAssistantText.slice(-SUMMARY_TAIL_CHARS)
      : lastAssistantText
  return (
    <div className='web-code-deliverables' data-deliverables data-session-id={conversation.sessionId}>
      <div className='web-code-deliverables-title'>交付物（本会话）</div>
      <div data-deliverables-activities={activityCount}>工具活动: {activityCount}</div>
      {summary !== null && (
        <div className='web-code-deliverables-summary' data-deliverables-summary>{summary}</div>
      )}
      <div className='web-code-deliverables-note' data-deliverables-derived>
        转录推导 · 载体暂无文件级交付面
      </div>
    </div>
  )
}
