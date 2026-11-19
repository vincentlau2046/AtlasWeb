// T6-A Task 8: 会话主视图（纯展示层——SSR 可渲染）。ReplayView 与 LiveFollow
// 共此一体：同一模型（replay 加载 → follow 收敛），status 徽标区分。
// RF5：消息列表经 windowing 切片只挂载可见窗（默认窗由滚动状态驱动；SSR
// /测试注入 visibleRange 直证有界）。RF3：annotation 块/消息可见渲染。
import { useEffect, useRef, useState } from 'react'
import { MarkdownText, Pill } from '@atlasweb/web-primitives'
import type { MarkdownLabels } from '@atlasweb/web-primitives'
import type { BlockVM, ConversationModel, MessageVM } from '../projection.ts'
import { computeVisibleRange, type WindowRange } from '../windowing.ts'

/** Read-only Code view markdown chrome (English; locale edge lives with the shell host). */
const MARKDOWN_LABELS: MarkdownLabels = {
  code: { copyLabel: 'Copy', copiedLabel: 'Copied' },
  footnotes: 'Footnotes',
}

/** Presentation props for the conversation view. */
export interface ConversationViewProps {
  conversation: ConversationModel
  /** Explicit window override (tests/SSR); default = scroll-driven window. */
  visibleRange?: WindowRange
}

/** One message row. */
function MessageRow({ message }: { message: MessageVM }) {
  return (
    <div className='web-code-message' data-message-id={message.id} data-role={message.role}>
      <div className='web-code-message-meta'>
        {message.createdAt !== null && <span>{message.createdAt.slice(0, 19).replace('T', ' ')}</span>}
      </div>
      <div className='web-code-message-body'>
        {message.blocks.map((block, index) => <BlockRow key={index} block={block} />)}
      </div>
    </div>
  )
}

/** One block row inside a message. */
function BlockRow({ block }: { block: BlockVM }) {
  if (block.kind === 'text') return <div className='web-code-text'><MarkdownText text={block.text} labels={MARKDOWN_LABELS} /></div>
  if (block.kind === 'activity') {
    return (
      <div className='web-code-activity' data-activity>
        <Pill>{block.label}</Pill>
        {block.status !== undefined && <span data-activity-status>{block.status}</span>}
      </div>
    )
  }
  return (
    <div className='web-code-annotation' data-annotation role='note'>
      {block.reason}
    </div>
  )
}

/** The empty-conversation face (RF2). */
function EmptyState({ status }: { status: ConversationModel['status'] }) {
  return (
    <div data-empty-state>
      {status === 'idle' ? 'No session open.' : 'This session has no messages yet.'}
    </div>
  )
}

/**
 * The conversation main panel: header (session identity + connection status),
 * then the windowed transcript.
 * @param props - the conversation model + optional explicit window.
 * @returns the panel markup.
 */
export function ConversationView(props: ConversationViewProps) {
  const { conversation } = props
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const pinnedToTail = useRef(true)
  // Keep the tail visible while the stream appends and the reader is at the tail.
  useEffect(() => {
    const element = scrollRef.current
    /* v8 ignore next -- the ref is always attached by effect time: the scroll container renders unconditionally. */
    if (element === null || !pinnedToTail.current) return
    element.scrollTop = element.scrollHeight
  }, [conversation.messages])

  const total = conversation.messages.length
  const range = props.visibleRange ?? computeVisibleRange(
    total, scrollTop, 600, 28, { size: 60, overscan: 10 },
  )
  const slice = conversation.messages.slice(range.start, range.end)
  return (
    <div className='web-code-conversation' data-conversation>
      <div className='web-code-conversation-header' data-conversation-header>
        <span data-conn-status={conversation.status}><Pill>{conversation.status}</Pill></span>
        {conversation.error !== undefined && (
          <span data-conn-error role='alert'>
            {conversation.error.code}: {conversation.error.message}
          </span>
        )}
      </div>
      <div
        ref={scrollRef}
        className='web-code-transcript'
        data-transcript
        onScroll={event => {
          const element = event.currentTarget
          pinnedToTail.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40
          setScrollTop(element.scrollTop)
        }}
      >
        {total === 0
          ? <EmptyState status={conversation.status} />
          : slice.map(message => <MessageRow key={message.id} message={message} />)}
      </div>
    </div>
  )
}
