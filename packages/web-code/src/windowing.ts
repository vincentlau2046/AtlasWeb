// T6-A Task 8: RF5 有界窗计算（纯函数——DOM 有界判据的核）。
// 回放消息列表窗化：只渲染可见窗切片，禁全量挂载。A2 起 ConversationView
// 的浏览器路径改用 @tanstack/react-virtual（可测量可变高 + 总跨度占位，
// 白名单域、仅 web-code 声明）；本文件保留两职：① 无滚动元素（SSR 首帧）
// 与显式 visibleRange（测试/SSR 覆盖）的回退切片；② 纯函数可直测的有界
// 判据（原 Task 7 零消费裁定由 A2 反转，ledger 在案）。

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
