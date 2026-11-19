// T6-A Task 4: web-brand 槽位契约（回审裁定形——主题 token 源接口）。
// Task 8 落品牌实现（品牌系统 spec 为源）；本文件先冻结消费侧接口，
// web-theme 的 ThemeRuntime 以此为 durable 偏好传输（dsh ConfigForm 剥离形的槽位替身）。

/**
 * Durable theme-settings transport consumed by the theme runtime. Operational
 * shape mirrors the dsh settings scope it replaces: snapshot reads, change
 * subscription, single-field writes, and batched mutations — with the
 * ui-settings edge itself absent (Atlas seam, R5 禁入).
 */
export interface ThemeSettingsHost<S> {
  /** Subscribe to accepted-section changes. */
  subscribe(fn: () => void): () => void
  /** Current durable section snapshot; `value` is undefined until the first accepted section arrives. */
  getSnapshot(): { value: S | undefined }
  /** Write one field through the durable section. */
  set(field: string, value: unknown): Promise<boolean>
  /** Batched field writes applied as one mutation. */
  mutate(ops: Array<{ op: 'set'; path: Array<string | number>; value: unknown }>): Promise<boolean>
}
