// A3: 阅读锚（纯函数——storage 注入，SSR/浏览器双可运行）。
// 键 `atlasweb:anchor:v1:<encoded scopeId>:<encoded sessionId>`；storage
// 被禁用/配额满/畸形条目一律降级（读 null / 写静默），绝不抛——锚是
// 恢复便利面，不是正确性依赖。锚绑定（会话, 消息）由 A2 的稳定
// data-message-id 供给；URL ?session=<id> 表示当前选择，读取不等于授权
// （服务端凭据面独立裁决）。

/** A persisted reading position: anchored message + signed px offset from its
 * top to the viewport top（负值 = 锚行顶在视口上方，行跨视口顶——保真值）。 */
export interface ReadingAnchor {
  messageId: string
  offsetPx: number
}

/** Versioned storage key for one (scope, session) pair. */
export function anchorKey(scopeId: string, sessionId: string): string {
  return `atlasweb:anchor:v1:${encodeURIComponent(scopeId)}:${encodeURIComponent(sessionId)}`
}

/**
 * Read the anchor for a session; any absence/malformity degrades to null.
 * @param storage - persisted store (null = SSR / disabled: no-op).
 * @param scopeId - scope namespace (single-scope product: 'main').
 * @param sessionId - the session the anchor belongs to.
 * @returns the stored anchor, or null.
 */
export function readAnchor(storage: Storage | null, scopeId: string, sessionId: string): ReadingAnchor | null {
  if (storage === null) return null
  let raw: string | null
  try {
    raw = storage.getItem(anchorKey(scopeId, sessionId))
  } catch {
    return null // disabled/blocked storage: degrade
  }
  if (raw === null) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (parsed === null || typeof parsed !== 'object') return null
  const record = parsed as { messageId?: unknown; offsetPx?: unknown }
  if (typeof record.messageId !== 'string' || record.messageId.length === 0) return null
  // 任何有限数（含负）都是合法保真偏移——锚行高于视口顶时 rect.top -
  // containerTop 为负，clamp 到 0 会跳回行首丢行内位置。非数值降级 0。
  const offsetPx = typeof record.offsetPx === 'number' && Number.isFinite(record.offsetPx)
    ? record.offsetPx
    : 0
  return { messageId: record.messageId, offsetPx }
}

/**
 * Persist the anchor; failures (disabled storage, quota) are silent.
 */
export function writeAnchor(storage: Storage | null, scopeId: string, sessionId: string, anchor: ReadingAnchor): void {
  if (storage === null) return
  try {
    storage.setItem(anchorKey(scopeId, sessionId), JSON.stringify(anchor))
  } catch {
    // quota/disabled: restore convenience degrades, nothing else depends on it.
  }
}
