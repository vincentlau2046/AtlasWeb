// T6-A Task 8: RF5 有界窗计算（纯函数——DOM 有界判据的核）。
// 回放消息列表按固定估高行窗化：只渲染 [start, end) 切片 + 上下 overscan，
// 禁全量挂载。冻结清单预注册的 @tanstack/react-virtual 为白名单可用项，但
// 其 hook 形需浏览器测量（DOM-free 测试约束内不可运行）；本波以自算切片
// 供给同判据（单代码路径、可直测）——裁定入 ledger，react-virtual dep 行
// 保持零消费（Task 7 剔除纪律不回摆）。

/** Half-open visible window [start, end) over a flat list. */
export interface WindowRange {
  start: number
  end: number
}

/** Rendered window size in rows (the bounded mount target). */
export const REPLAY_WINDOW_SIZE = 60

/** Extra rows rendered on either side of the visible window. */
export const REPLAY_OVERSCAN = 10

/**
 * Compute the visible window for a fixed estimated row height.
 * @param total - total row count.
 * @param scrollTop - container scroll position in px.
 * @param viewportHeight - visible viewport height in px.
 * @param rowHeight - estimated row height in px.
 * @param opts - window/overscan overrides (tests).
 * @returns the clamped half-open window; never inverted, never unbounded.
 */
export function computeVisibleRange(
  total: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  opts?: { size?: number; overscan?: number },
): WindowRange {
  const size = opts?.size ?? REPLAY_WINDOW_SIZE
  const overscan = opts?.overscan ?? REPLAY_OVERSCAN
  if (total <= size + overscan * 2) return { start: 0, end: total }
  if (!(rowHeight > 0) || !(viewportHeight > 0)) return { start: 0, end: Math.min(total, size + overscan) }
  // Clamp the first visible row to the tail-reachable position so an
  // overshooting scroll position cannot push the window past the list end.
  const firstVisible = Math.min(Math.floor(scrollTop / rowHeight), Math.max(0, total - size - overscan))
  const start = Math.max(0, firstVisible - overscan)
  const end = Math.min(total, firstVisible + size + overscan)
  return { start, end: Math.max(start, end) }
}
