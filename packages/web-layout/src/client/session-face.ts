// T6-A Task 7: 结构型 sessions 消费面（web-code 槽契约冻结——Atlas seam）。
// dsh 的 useSessions 由 ui-session 包提供（产品服务子包禁入 R5）；AtlasWeb 中
// 该标准 hook 由 Task 8 web-code bundle 在根 runtime 供给。web-layout 只消费
// 标题投影所需的最小结构形（DocumentTitle retainedBy.mainView 选择逻辑逐字对
// dsh ui-session 的 SessionListState 形），Task 8 以此契约为供给锚。

/** The one session field DocumentTitle projects (structural slice). */
export interface SessionTitleEntry {
  id: string
  title: string | null
  /** Retention marks; DocumentTitle selects the main-view-retained session. */
  retainedBy: { mainView?: number }
}

/** Minimal sessions state face consumed by the layout frame. */
export interface SessionTitleState {
  byId: Record<string, SessionTitleEntry>
}

/** The root-standard sessions selector hook web-code supplies (Task 8). */
export type UseSessionsTitle = import('@atlasweb/web-slots').SnapshotSelectorHook<SessionTitleState>
