// T6-A Task 8: 会话主视图（纯展示层——SSR 可渲染）。ReplayView 与 LiveFollow
// 共此一体：同一模型（replay 加载 → follow 收敛），status 徽标区分。
// RF5：消息列表窗化只挂载可见窗（A2 起 = @tanstack/react-virtual 可测量
// 可变高 + 总跨度占位；SSR/测试注入 visibleRange 直证有界——回退路径仍走
// windowing 自算切片，冻结清单白名单域、仅 web-code 声明）。RF3：annotation
// 块/消息可见渲染。A2：目标消息定位（未挂载 → 滚到索引 → 测高后对齐）+
// data-search-target 标记与稳定 data-message-id 同行绑定。
import { useEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { MarkdownText, Pill } from '@atlasweb/web-primitives'
import type { MarkdownLabels } from '@atlasweb/web-primitives'
import type { BlockVM, ConversationModel, MessageVM } from '../projection.ts'
import { writeAnchor, type ReadingAnchor } from '../readingAnchor.ts'
import { computeVisibleRange, REPLAY_OVERSCAN, REPLAY_WINDOW_SIZE, type WindowRange } from '../windowing.ts'

/** Read-only Code view markdown chrome (English; locale edge lives with the shell host). */
const MARKDOWN_LABELS: MarkdownLabels = {
  code: { copyLabel: 'Copy', copiedLabel: 'Copied' },
  footnotes: 'Footnotes',
}

/** Presentation props for the conversation view. */
export interface ConversationViewProps {
  conversation: ConversationModel
  /** Explicit window override (tests/SSR); default = virtualized window. */
  visibleRange?: WindowRange
  /** A2 定位目标消息 id（与 conversation.sessionId 绑定后由槽位装配传入）。 */
  targetMessageId?: string
  /** A2 目标代数：重复点同一命中重触发滚动。 */
  targetGeneration?: number
  /** A3 对齐偏移：目标行顶与容器顶的期望间距 px（锚恢复 ≠0；默认顶对齐）。 */
  targetOffsetPx?: number
  /** A3 恢复锚不可用（消息已不存在）：明示提示面，不静默跳位。 */
  anchorMissed?: boolean
  /** A3 锚持久化面（sessionStorage；null/缺省 = 不写）。 */
  anchorStorage?: Storage | null
}

/** Meta + body content of one message row. */
function MessageBody({ message }: { message: MessageVM }) {
  return (
    <>
      <div className='web-code-message-meta'>
        {message.createdAt !== null && <span>{message.createdAt.slice(0, 19).replace('T', ' ')}</span>}
      </div>
      <div className='web-code-message-body'>
        {message.blocks.map((block, index) => <BlockRow key={index} block={block} />)}
      </div>
    </>
  )
}

/** One message row (plain-list path). */
function MessageRow({ message, searchTarget = false }: { message: MessageVM; searchTarget?: boolean }) {
  return (
    <div
      className='web-code-message'
      data-message-id={message.id}
      data-role={message.role}
      data-search-target={searchTarget || undefined}
    >
      <MessageBody message={message} />
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
 * A3: the anchor for the current reading position — the topmost row whose
 * bottom is still below the container top, plus its px gap below that top.
 */
function currentAnchor(container: HTMLElement): ReadingAnchor | null {
  const containerTop = container.getBoundingClientRect().top
  for (const row of container.querySelectorAll<HTMLElement>('[data-message-id]')) {
    const rect = row.getBoundingClientRect()
    if (rect.bottom > containerTop + 1) {
      const id = row.getAttribute('data-message-id')
      if (id !== null && id.length > 0) {
        return { messageId: id, offsetPx: Math.max(0, Math.round(rect.top - containerTop)) }
      }
    }
  }
  return null
}

/**
 * The conversation main panel: header (session identity + connection status),
 * then the windowed transcript.
 * @param props - the conversation model + optional explicit window + target.
 * @returns the panel markup.
 */
export function ConversationView(props: ConversationViewProps) {
  const { conversation } = props
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const pinnedToTail = useRef(true)
  const alignedRef = useRef<string>('')
  const total = conversation.messages.length

  // A2：可测量可变高 + 总跨度占位（hook 无条件调用——无滚动元素（SSR/
  // 首帧）或显式 visibleRange（测试/SSR 覆盖）时回退自算切片）。
  const virtualizer = useVirtualizer({
    count: total,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 64,
    overscan: REPLAY_OVERSCAN,
    getItemKey: index => conversation.messages[index]?.id ?? `idx-${index}`,
  })

  // Keep the tail visible while the stream appends and the reader is at the
  // tail; rerun when the virtualized list takes over (full-span placeholder
  // replaces the fallback slice height).
  const virtualItems = virtualizer.getVirtualItems()
  const virtualized = props.visibleRange === undefined && virtualItems.length > 0
  useEffect(() => {
    const element = scrollRef.current
    /* v8 ignore next -- the ref is always attached by effect time: the scroll container renders unconditionally. */
    if (element === null || !pinnedToTail.current) return
    element.scrollTop = element.scrollHeight
  }, [conversation.messages, virtualized])

  // A2 定位：目标未挂载 → 滚到索引 → 测高后对齐（真实元素位置修正估高
  // 滚动）；目标不在当前模型 → A3 明示回退（A2 no-op）。
  useEffect(() => {
    const targetId = props.targetMessageId
    if (targetId === undefined) return
    const key = `${targetId}:${props.targetGeneration ?? 0}`
    if (alignedRef.current === key) return
    const index = conversation.messages.findIndex(message => message.id === targetId)
    if (index < 0) return
    const element = scrollRef.current
    if (element === null) return
    alignedRef.current = key
    pinnedToTail.current = false
    virtualizer.scrollToIndex(index, { align: 'start' })
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        // 测高后对齐：按真实元素位置修正估高滚动；offsetPx ≠0 时行顶落在
        // 容器顶下方该偏移处（锚恢复保持阅读位）。
        const row = element.querySelector(`[data-message-id="${CSS.escape(targetId)}"]`)
        if (row !== null) {
          const gap = row.getBoundingClientRect().top - element.getBoundingClientRect().top
          element.scrollTop += gap - (props.targetOffsetPx ?? 0)
        }
      })
    })
    return () => cancelAnimationFrame(raf)
  }, [props.targetMessageId, props.targetGeneration, props.targetOffsetPx, conversation.messages, virtualizer])

  // A3 锚持久化：滚动静默 250ms 后写当前阅读位（顶层可见行 + 偏移）。
  // scope 单一（'main'）——锚键含 scope 命名空间，多 scope 展开时由此处供给。
  const anchorStorage = props.anchorStorage
  useEffect(() => {
    const sessionId = conversation.sessionId
    if (anchorStorage === null || anchorStorage === undefined || sessionId === null || total === 0) return
    const timer = setTimeout(() => {
      const element = scrollRef.current
      if (element === null) return
      const anchor = currentAnchor(element)
      if (anchor !== null) writeAnchor(anchorStorage, 'main', sessionId, anchor)
    }, 250)
    return () => clearTimeout(timer)
  }, [scrollTop, conversation.sessionId, total, anchorStorage])

  const range = props.visibleRange ?? computeVisibleRange(
    total, scrollTop, 600, 64, { size: REPLAY_WINDOW_SIZE, overscan: REPLAY_OVERSCAN },
  )
  return (
    <div className='web-code-conversation' data-conversation>
      <div className='web-code-conversation-header' data-conversation-header>
        <span data-conn-status={conversation.status}><Pill>{conversation.status}</Pill></span>
        {conversation.error !== undefined && (
          <span data-conn-error role='alert'>
            {conversation.error.code}: {conversation.error.message}
          </span>
        )}
        {props.anchorMissed === true && (
          <div className='web-code-anchor-missed' data-anchor-missed role='status'>
            Saved reading position is no longer available — the session is shown from a usable position.
          </div>
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
        {total === 0 && <EmptyState status={conversation.status} />}
        {total > 0 && virtualized && (
          <div
            className='web-code-transcript-list'
            data-transcript-list
            style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}
          >
            {virtualItems.map(item => {
              const message = conversation.messages[item.index]
              if (message === undefined) return null
              return (
                <div
                  key={message.id}
                  ref={virtualizer.measureElement}
                  data-index={item.index}
                  className='web-code-message'
                  data-message-id={message.id}
                  data-role={message.role}
                  data-search-target={message.id === props.targetMessageId || undefined}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${item.start}px)` }}
                >
                  <MessageBody message={message} />
                </div>
              )
            })}
          </div>
        )}
        {total > 0 && !virtualized && (
          conversation.messages.slice(range.start, range.end).map(message => (
            <MessageRow key={message.id} message={message} searchTarget={message.id === props.targetMessageId} />
          ))
        )}
      </div>
    </div>
  )
}
