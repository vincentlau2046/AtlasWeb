// T6-A Task 8: web-code entry 模块面——loader entry（apply 插件形）+ 接线。
// 职责：① 连接引导（config.connection → AtlasConnection）；② 根 runtime 供给
// （provideRoot hooks.sessions = SessionTitleState 源——web-layout 的
// useSessions 标准 prop 契约，Task 7 session-face 冻结形）；③ 槽位注册
// （sidebar 单槽 = NavigationColumn；main keyed 'conversation' =
// ConversationView）；④ 会话服务暴露（ctx.reflect.provide('conversation')）。
// 只读红线：本包零对话输入面/审批面词汇、零写路径（会话取消等写操作不存在）。
import type { ObservableSnapshot } from '@atlasweb/web-store'
import { connect, type AtlasConnection, type AtlasConnectionConfig } from '@atlasweb/web-connection'
import { WebCodeController,
  type SearchModel, type SessionListModel, type SessionTitleState } from './controller.ts'
import type { ConversationModel } from './projection.ts'
import { NavigationColumnView } from './views/NavigationColumnView.tsx'
import { ConversationView } from './views/ConversationView.tsx'

export { WebCodeController } from './controller.ts'
export type { SessionListModel, SessionRowVM, SearchModel, SearchResultVM, SessionTitleEntry, SessionTitleState } from './controller.ts'
export { applyFollowEvent, emptyConversation, modelFromProjection } from './projection.ts'
export type { ActivityBlockVM, AnnotationVM, BlockVM, ConversationModel, MessageVM, TextBlockVM } from './projection.ts'
export { computeVisibleRange, REPLAY_OVERSCAN, REPLAY_WINDOW_SIZE } from './windowing.ts'
export type { WindowRange } from './windowing.ts'
export { NavigationColumnView } from './views/NavigationColumnView.tsx'
export { ConversationView } from './views/ConversationView.tsx'

/** Entry configuration (cordis plugin config channel; Task 9 wires the real values). */
export interface WebCodeConfig {
  connection: AtlasConnectionConfig
  /** Test/storage injection seam forwarded to the connection. */
  fetch?: typeof fetch
  /** Product mode id (web-mode registry); defaults to Code. */
  modeId?: string
}

/** The controller service face registered as ctx 'conversation'. */
export interface ConversationService {
  sessionList: ObservableSnapshot<SessionListModel>
  searchState: ObservableSnapshot<SearchModel>
  conversation: ObservableSnapshot<ConversationModel>
  titleState: ObservableSnapshot<SessionTitleState>
  refreshSessions(): Promise<void>
  search(query: string): Promise<void>
  openSession(sessionId: string): Promise<void>
  dispose(): Promise<void>
}

/** Slot-injected standard hooks for the sidebar component. */
interface NavStandardProps {
  useSessionList: <S>(sel: (snapshot: SessionListModel) => S) => S
  useSearch: <S>(sel: (snapshot: SearchModel) => S) => S
}

/** Slot-injected standard hooks for the conversation component. */
interface ConversationStandardProps {
  useConversation: <S>(sel: (snapshot: ConversationModel) => S) => S
}

/** Minimal context face the entry needs (stub-friendly structural form). */
export interface WebCodeContext {
  slots: {
    provideRoot(contribution: { hooks: Record<string, unknown> }): () => void
    register(options: Record<string, unknown>, component: unknown): () => void
  }
  reflect: { provide(name: string, service: unknown): unknown }
}

/**
 * Entry plugin body: bootstrap the connection, bind the controller, supply
 * the root sessions hook, and register the two views.
 * @param ctx - client root context (entry context).
 * @param config - connection + mode configuration.
 */
export async function apply(ctx: WebCodeContext, config: WebCodeConfig): Promise<void> {
  const connection: AtlasConnection = await connect({ ...config.connection, fetch: config.fetch ?? config.connection.fetch })
  const controller = new WebCodeController(connection)
  await controller.refreshSessions()

  const rootHandle = ctx.slots.provideRoot({
    hooks: { sessions: controller.titleState },
  })

  const disposeNav = ctx.slots.register({
    name: 'sidebar',
    id: 'web-code.nav',
    label: 'Sessions',
    inject: (): { hooks: { sessionList: ObservableSnapshot<SessionListModel>; search: ObservableSnapshot<SearchModel> } } => ({
      hooks: { sessionList: controller.sessionList, search: controller.searchState },
    }),
  }, function NavigationColumn(standard: NavStandardProps) {
    const list = standard.useSessionList(snapshot => snapshot)
    const search = standard.useSearch(snapshot => snapshot)
    return (
      <NavigationColumnView
        sessions={list.rows}
        listStatus={list.status}
        listError={list.error}
        searchResults={search.results}
        searchQuery={search.query}
        onOpenSession={sessionId => { void controller.openSession(sessionId) }}
        onSearch={query => { void controller.search(query) }}
      />
    )
  })

  const disposeMain = ctx.slots.register({
    name: 'main',
    key: 'conversation',
    id: 'web-code.conversation',
    label: 'Conversation',
    inject: (): { hooks: { conversation: ObservableSnapshot<ConversationModel> } } => ({
      hooks: { conversation: controller.conversation },
    }),
  }, function Conversation(standard: ConversationStandardProps) {
    const conversation = standard.useConversation(snapshot => snapshot)
    return <ConversationView conversation={conversation} />
  })

  ctx.reflect.provide('conversation', {
    sessionList: controller.sessionList,
    searchState: controller.searchState,
    conversation: controller.conversation,
    titleState: controller.titleState,
    refreshSessions: () => controller.refreshSessions(),
    search: (query: string) => controller.search(query),
    openSession: (sessionId: string) => controller.openSession(sessionId),
    dispose: () => {
      disposeNav()
      disposeMain()
      rootHandle()
      return controller.dispose()
    },
  } satisfies ConversationService & { dispose(): Promise<void> })
}
