// T6-A Task 8: web-code entry 模块面——loader entry（apply 插件形）+ 接线。
// 职责：① 连接引导（config.connection → AtlasConnection）；② 根 runtime 供给
// （provideRoot hooks.sessions = SessionTitleState 源——web-layout 的
// useSessions 标准 prop 契约，Task 7 session-face 冻结形）；③ 槽位注册
// （sidebar 单槽 = NavigationColumn；main keyed 'conversation' =
// ConversationView）；④ 会话服务暴露（ctx.reflect.provide('conversation')）。
// 只读红线（T6-A）：默认零写路径。B 附表 §3 B2 开启门控例外：config.execution
// 注入时挂 ExecutionController + Composer（排队区/待批卡/输入面），probe=off
// 或未注入 → 执行面零渲染（纯只读回归腿保持）。
// W-UI-V G-B：web-code-* 视图类样式表（dsh token 词汇）——此前 0 样式命中。
import './views/views.css'
import type { ObservableSnapshot } from '@atlasweb/web-store'
import type { SlotScopeAdapter } from '@atlasweb/web-slots'
import { connect, type AtlasConnection, type AtlasConnectionConfig } from '@atlasweb/web-connection'
import { WebCodeController,
  type OpenTarget, type SearchModel, type SessionListModel,
  type SessionTitleState, type TargetMessageState } from './controller.ts'
import type { ConversationModel } from './projection.ts'
import { createSessionScopeAdapter } from './sessionScope.ts'
import { readAnchor } from './readingAnchor.ts'
import { ExecutionController,
  type ExecutionStatusModel, type ExecutionTransport } from './execution/executionController.ts'
import { NavigationColumnView } from './views/NavigationColumnView.tsx'
import { ConversationView } from './views/ConversationView.tsx'
import { Composer } from './views/Composer.tsx'
import { StatusStrip } from './views/StatusStrip.tsx'
import { DeliverablesCard } from './views/DeliverablesCard.tsx'
import { WorkspaceListPanel } from './views/WorkspaceListPanel.tsx'
import { SettingsPanel } from './settings/settingsPanel.tsx'

export { WebCodeController } from './controller.ts'
export type {
  OpenTarget, SessionListModel, SessionRowVM, SearchModel, SearchResultVM,
  SessionTitleEntry, SessionTitleState, TargetMessageState,
} from './controller.ts'
export { ExecutionController, createHttpExecutionTransport } from './execution/executionController.ts'
export type {
  ExecutionBinding, ExecutionDecision, ExecutionPhase, ExecutionQueueVM,
  ExecutionStatusModel, ExecutionTransport, PendingApprovalVM, SettledApprovalVM,
  SettledDecision,
} from './execution/executionController.ts'
export { applyFollowEvent, emptyConversation, modelFromProjection } from './projection.ts'
export type { ActivityBlockVM, AnnotationVM, BlockVM, ConversationModel, MessageVM, TextBlockVM } from './projection.ts'
export { computeVisibleRange, REPLAY_OVERSCAN, REPLAY_WINDOW_SIZE } from './windowing.ts'
export type { WindowRange } from './windowing.ts'
export { NavigationColumnView } from './views/NavigationColumnView.tsx'
export { ConversationView } from './views/ConversationView.tsx'
export { Composer } from './views/Composer.tsx'
export { QueueList } from './views/QueueList.tsx'
export { ApprovalCard } from './views/ApprovalCard.tsx'
export { StatusStrip } from './views/StatusStrip.tsx'
export { DeliverablesCard } from './views/DeliverablesCard.tsx'
export { WorkspaceListPanel } from './views/WorkspaceListPanel.tsx'
export { SettingsPanel } from './settings/settingsPanel.tsx'
export type { ThemeSettingsLike } from './settings/settingsPanel.tsx'

/** Entry configuration (cordis plugin config channel; Task 9 wires the real values). */
export interface WebCodeConfig {
  connection: AtlasConnectionConfig
  /** Test/storage injection seam forwarded to the connection. */
  fetch?: typeof fetch
  /** Product mode id (web-mode registry); defaults to Code. */
  modeId?: string
  /** A3 URL ?session=<id>（当前选择提示；读取不等于授权——凭据面独立裁决）。 */
  initialSessionId?: string
  /** A3 阅读锚持久化面（浏览器 = sessionStorage；缺省/null = 不读写）。 */
  anchorStorage?: Storage | null
  /**
   * B2 执行通道（可选；缺省 = 纯只读，执行面零渲染）。transport 注入 +
   * binding 闭包 = 组合根 workspace 意图（`{ workspaceId } | null`——workspace
   * 发现面在组合根解决，workspaceAuth 无 list 面本包不猜；会话维由本包以
   * 当前选中会话组装成完整 ExecutionBinding，attach 时点读快照）。
   */
  execution?: {
    transport: ExecutionTransport
    binding(): { workspaceId: string } | null
    /**
     * B3 收尾波工单增量①：workspace 发现列表（已授权集，组合根经
     * GET /execution/workspaces 预取；launch 期冻结）。在场 → 列表选择面
     * 挂载 + 选中项优先于 binding()（深链 hint 回退）；缺席 → 零列表钩子
     * （行为回到纯 hint 形）。选择 ≠ 授权：服务端逐命令对表不变（E1）。
     */
    workspaces?: Array<{ workspaceId: string }>
  }
  /**
   * B3 设置注入（F9 无空壳开关）：受支持设置面由组合根供给（现唯一族 =
   * 主题 ThemeSettingsStore）；缺席 → 面板零渲染 fail-closed。
   */
  settings?: {
    themeHost: ThemeSettingsLike | null
  }
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
  openTarget(target: OpenTarget): Promise<void>
  /** A4 手动重试（connectionLost 后经 openSession 同一机制重开当前会话）。 */
  retry(): Promise<void>
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
  useTargetMessage: <S>(sel: (snapshot: TargetMessageState | null) => S) => S
  /** B2：执行面状态（config.execution 注入时才有）。 */
  useExecution?: <S>(sel: (snapshot: ExecutionStatusModel) => S) => S
  /** B3 增量①：workspace 列表选择（config.execution.workspaces 在场时才有）。 */
  useWorkspaceSelection?: <S>(sel: (snapshot: string | null) => S) => S
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

  // B3 增量① workspace 列表选择 store（config.execution.workspaces 在场时才
  // 建）：面板 onSelect 与 inject 钩子同一写入口；select 幂等同值短路；选择
  // 变化触发 execution.attach() 换绑（同会话切换重 attach 先例）。选择 ≠ 授权：
  // 仅改客户端 binding 意图，服务端逐命令 workspaceAuth（E1）不变。
  let workspaceSelection: {
    getSnapshot(): string | null
    subscribe(fn: () => void): () => void
    select(workspaceId: string): void
  } | null = null
  if (config.execution?.workspaces !== undefined) {
    let selectedWorkspace: string | null = null
    const listeners = new Set<() => void>()
    workspaceSelection = {
      getSnapshot: (): string | null => selectedWorkspace,
      subscribe(fn: () => void) {
        listeners.add(fn)
        return () => { listeners.delete(fn) }
      },
      select(workspaceId: string) {
        if (selectedWorkspace === workspaceId) return
        selectedWorkspace = workspaceId
        for (const listener of listeners) listener()
      },
    }
  }

  // B2 执行通道：可选注入，缺省零渲染。绑定组装：workspace 维 = 选中项优先
  //（增量①列表选择），回退组合根意图（config.execution.binding() = URL hint
  // 深链）；会话维 = 当前选中会话（controller.sessionId 唯一真源，attach 时点
  // 读快照——无 URL 回读竞态）；任一维缺 → null → disabled。会话切换即重
  // attach（probe → 按新绑定重开事件流）。
  let execution: ExecutionController | null = null
  if (config.execution !== undefined) {
    execution = new ExecutionController(config.execution.transport, {
      binding: () => {
        const selected = workspaceSelection?.getSnapshot() ?? null
        const workspace = selected !== null ? { workspaceId: selected } : config.execution!.binding()
        const sessionId = controller.sessionId.getSnapshot()
        if (workspace === null || sessionId === null) return null
        return { workspaceId: workspace.workspaceId, sessionId }
      },
    })
    await execution.attach()
    const unsubscribeExecution = controller.sessionId.subscribe(() => { void execution?.attach() })
    ctx.effect?.(() => unsubscribeExecution)
    const unsubscribeSelection = workspaceSelection?.subscribe(() => { void execution?.attach() }) ?? null
    if (unsubscribeSelection !== null) ctx.effect?.(() => unsubscribeSelection)
  }

  // A3 刷新恢复：URL ?session=<id> → 打开该会话并恢复阅读锚（锚指向的
  // 消息不存在 → 视图 anchorMissed 明示面，不跳其他会话）。scope 单一
  // （'main'）；读取不等于授权——服务端凭据面独立裁决。
  if (config.initialSessionId !== undefined) {
    const anchor = readAnchor(config.anchorStorage ?? null, 'main', config.initialSessionId)
    void controller.openTarget({
      sessionId: config.initialSessionId,
      ...(anchor !== null ? { messageId: anchor.messageId, offsetPx: anchor.offsetPx } : {}),
    })
  }

  // A3 URL 同步：当前选择回写 ?session=<id>（null 选择剥除参数）。
  if (typeof window !== 'undefined' && typeof window.history !== 'undefined') {
    const syncSessionUrl = (sessionId: string | null): void => {
      const url = new URL(window.location.href)
      if (sessionId === null) url.searchParams.delete('session')
      else url.searchParams.set('session', sessionId)
      if (url.toString() !== window.location.href) window.history.replaceState(null, '', url.toString())
    }
    syncSessionUrl(controller.sessionId.getSnapshot())
    const unsubscribeUrl = controller.sessionId.subscribe(() => {
      syncSessionUrl(controller.sessionId.getSnapshot())
    })
    // cordis effect 语义：execute 立即执行，**返回值**才是 dispose——传函数
    // 本身（不调用）。`(() => unsubscribeUrl())` 会把退订当场执行（A3 e2e
    // 实测定谳：URL 永不回写）。
    ctx.effect?.(() => unsubscribeUrl)
  }

  // session scope 适配器（ui-session 等价件）：renderRoot 全树包
  // ScopeProvider('session-maybe')，'session' 适配器须恒安装——缺失即整树
  // SlotAssemblyError（浏览器首启现形，2026-11-20）。订阅生命周期挂 ctx.effect。
  const sessionAdapter = createSessionScopeAdapter(controller)
  ctx.slots.installScope?.('session', sessionAdapter)
  // 同上：传 dispose 本身（不调用）——`(() => adapter.dispose())` 会在
  // apply 当场注销 controller 订阅（与 URL 同步同形 bug，一并修正）。
  ctx.effect?.(() => sessionAdapter.dispose)

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
        onOpenSession={target => { void controller.openTarget(target) }}
        onSearch={query => { void controller.search(query) }}
      />
    )
  })

  const disposeMain = ctx.slots.register({
    name: 'main',
    key: 'conversation',
    id: 'web-code.conversation',
    label: 'Conversation',
    inject: (): { hooks: { conversation: ObservableSnapshot<ConversationModel>; targetMessage: ObservableSnapshot<TargetMessageState | null>; execution?: ObservableSnapshot<ExecutionStatusModel>; workspaceSelection?: { getSnapshot(): string | null; subscribe(fn: () => void): () => void; select(workspaceId: string): void } } } => ({
      hooks: {
        conversation: controller.conversation,
        targetMessage: controller.targetMessage,
        ...(execution !== null ? { execution: execution.status } : {}),
        ...(workspaceSelection !== null ? { workspaceSelection } : {}),
      },
    }),
  }, function Conversation(standard: ConversationStandardProps) {
    const conversation = standard.useConversation(snapshot => snapshot)
    const target = standard.useTargetMessage(snapshot => snapshot)
    const exec = standard.useExecution !== undefined ? standard.useExecution(snapshot => snapshot) : null
    const wsSelected = standard.useWorkspaceSelection !== undefined ? standard.useWorkspaceSelection(snapshot => snapshot) : null
    // 目标与会话绑定：只把属于当前会话的定位锚传给视图（不跨会话泄露）。
    const bound = target !== null && target.sessionId === conversation.sessionId
    // A3 锚缺席明示：恢复目标（绑定了消息）在已加载消息中不存在 → 提示
    // 面（不静默跳位、不跳其他会话）。搜索命中目标同样适用（应不存在）。
    const anchorMissed = bound && conversation.messages.length > 0
      && !conversation.messages.some(message => message.id === target.messageId)
    return (
      <>
        {/* B3 增量①：workspace 发现列表选择面——仅列表在场时渲染（无列表
            回归腿 = 零渲染）；选择 ≠ 授权（服务端逐命令对表 E1）。 */}
        {workspaceSelection !== null && config.execution?.workspaces !== undefined
          && config.execution.workspaces.length > 0 && (
          <WorkspaceListPanel
            workspaces={config.execution.workspaces}
            selectedId={wsSelected}
            onSelect={workspaceId => workspaceSelection.select(workspaceId)}
          />
        )}
        <ConversationView
          conversation={conversation}
          targetMessageId={bound ? target.messageId : undefined}
          targetGeneration={bound ? target.generation : undefined}
          targetOffsetPx={bound ? target.offsetPx : undefined}
          anchorMissed={anchorMissed || undefined}
          anchorStorage={config.anchorStorage ?? null}
          onRetry={() => { void controller.retry() }}
        />
        {execution !== null && exec !== null && (
          <Composer
            phase={exec.phase}
            queue={exec.queue}
            pendingApprovals={exec.pendingApprovals}
            settledApprovals={exec.settledApprovals}
            commandError={exec.error}
            // submit 拒绝透传给 Composer（保输入 + status.error 明示面）；
            // 其余命令错误面由 status.error 承载，此处防 unhandled rejection。
            onSubmit={text => execution!.submit(text)}
            onCancel={turnId => { void execution!.cancel(turnId).catch(() => {}) }}
            onRemove={turnId => { void execution!.remove(turnId).catch(() => {}) }}
            onDecide={(approvalId, decision) => { void execution!.decide(approvalId, decision).catch(() => {}) }}
          />
        )}
        <DeliverablesCard conversation={conversation} />
      </>
    )
  })

  // B3 状态条（shell.bottom 单槽）：仅 execution 通道注入时挂载（只读红线）。
  const disposeStrip = execution !== null
    ? ctx.slots.register({
        name: 'shell.bottom',
        id: 'web-code.status',
        label: 'Status',
        inject: (): { hooks: { execution: ObservableSnapshot<ExecutionStatusModel> } } => ({
          hooks: { execution: execution.status },
        }),
      }, function Status(standard: { useExecution: <S>(sel: (snapshot: ExecutionStatusModel) => S) => S }) {
        const exec = standard.useExecution(snapshot => snapshot)
        return <StatusStrip status={exec} />
      })
    : undefined
  // B3 设置面板（shell.overlay list 槽）：受支持设置面由组合根注入；host
  // 缺席面板零渲染（fail-closed），toggle 常在（非执行面，只读模式可用）。
  const disposeSettings = ctx.slots.register({
    name: 'shell.overlay',
    id: 'web-code.settings',
    label: 'Settings',
    inject: () => ({ hooks: {} }),
  }, function Settings() {
    return <SettingsPanel themeHost={config.settings?.themeHost ?? null} />
  })

  ctx.reflect.provide('conversation', {
    sessionList: controller.sessionList,
    searchState: controller.searchState,
    conversation: controller.conversation,
    titleState: controller.titleState,
    refreshSessions: () => controller.refreshSessions(),
    search: (query: string) => controller.search(query),
    openSession: (sessionId: string) => controller.openSession(sessionId),
    openTarget: (target: OpenTarget) => controller.openTarget(target),
    retry: () => controller.retry(),
    dispose: () => {
      disposeNav()
      disposeMain()
      disposeStrip?.()
      disposeSettings()
      rootHandle()
      execution?.dispose()
      return controller.dispose()
    },
  } satisfies ConversationService & { dispose(): Promise<void> })
}
