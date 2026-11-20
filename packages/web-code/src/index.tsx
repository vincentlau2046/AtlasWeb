// T6-A Task 8: web-code entry 模块面——loader entry（apply 插件形）+ 接线。
// 职责：① 连接引导（config.connection → AtlasConnection）；② 根 runtime 供给
// （provideRoot hooks.sessions = SessionTitleState 源——web-layout 的
// useSessions 标准 prop 契约，Task 7 session-face 冻结形）；③ 槽位注册
// （sidebar 单槽 = NavigationColumn；main keyed 'conversation' =
// ConversationView）；④ 会话服务暴露（ctx.reflect.provide('conversation')）。
// 只读红线：本包零对话输入面/审批面词汇、零写路径（会话取消等写操作不存在）。
// W-UI-V G-B：web-code-* 视图类样式表（dsh token 词汇）——此前 0 样式命中。
import './views/views.css'
import type { ObservableSnapshot } from '@atlasweb/web-store'
import type { SlotScopeAdapter } from '@atlasweb/web-slots'
import { connect, type AtlasConnection, type AtlasConnectionConfig } from '@atlasweb/web-connection'
import { WebCodeController,
  type SearchModel, type SessionListModel, type SessionTitleState } from './controller.ts'
import type { ConversationModel } from './projection.ts'
import { createSessionScopeAdapter } from './sessionScope.ts'
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
  useSelectedSession: <S>(sel: (snapshot: string | null) => S) => S
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
    /** session scope 适配器安装（运行时 SlotRegistry 实有；stub 可缺省）。 */
    installScope?(scope: 'session', adapter: SlotScopeAdapter): void
  }
  /** 生命周期挂载（cordis ctx 实有；stub 可缺省）。 */
  effect?(fn: () => (() => void) | void): () => void
  reflect: { provide(name: string, service: unknown): unknown }
}

/**
 * Entry plugin body: bootstrap the connection, bind the controller, supply
 * the root sessions hook, and register the two views.
 * @param ctx - client root context (entry context).
 * @param config - connection + mode configuration.
 */
export async function apply(ctx: WebCodeContext, config: WebCodeConfig): Promise<void> {
  const fetchImpl = config.fetch ?? config.connection.fetch
  let connection: AtlasConnection
  try {
    connection = await connect({ ...config.connection, fetch: fetchImpl })
  } catch (error) {
    if (config.connection.launchToken === undefined) throw error
    // 重入/reload 形：单次 launch token 已消费（redeem 非 2xx）→ ambient
    // cookie 面续命（浏览器 cookie jar 已持有会话，headers() 零 Bearer；
    // web-host readCredential cookie 优先序兜住）。真无凭据面原样抛。
    connection = await connect({ ...config.connection, launchToken: undefined, credential: '', fetch: fetchImpl })
  }
  const controller = new WebCodeController(connection)
  await controller.refreshSessions()

  // session scope 适配器（ui-session 等价件）：renderRoot 全树包
  // ScopeProvider('session-maybe')，'session' 适配器须恒安装——缺失即整树
  // SlotAssemblyError（浏览器首启现形，2026-11-20）。订阅生命周期挂 ctx.effect。
  const sessionAdapter = createSessionScopeAdapter(controller)
  ctx.slots.installScope?.('session', sessionAdapter)
  ctx.effect?.(() => sessionAdapter.dispose())

  const rootHandle = ctx.slots.provideRoot({
    hooks: { sessions: controller.titleState },
  })

  const disposeNav = ctx.slots.register({
    name: 'sidebar',
    id: 'web-code.nav',
    label: 'Sessions',
    inject: (): { hooks: { sessionList: ObservableSnapshot<SessionListModel>; search: ObservableSnapshot<SearchModel>; selectedSession: ObservableSnapshot<string | null> } } => ({
      hooks: { sessionList: controller.sessionList, search: controller.searchState, selectedSession: controller.sessionId },
    }),
  }, function NavigationColumn(standard: NavStandardProps) {
    const list = standard.useSessionList(snapshot => snapshot)
    const search = standard.useSearch(snapshot => snapshot)
    const selectedId = standard.useSelectedSession(snapshot => snapshot)
    return (
      <NavigationColumnView
        sessions={list.rows}
        listStatus={list.status}
        listError={list.error}
        searchResults={search.results}
        searchQuery={search.query}
        selectedId={selectedId}
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
