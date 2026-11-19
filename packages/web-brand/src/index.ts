// T6-A Task 4: web-brand 槽位契约（回审裁定形——主题 token 源接口）。
// Task 8 落品牌实现（品牌系统 spec 为源）；本文件先冻结消费侧接口，
// web-theme 的 ThemeRuntime 以此为 durable 偏好传输（dsh ConfigForm 剥离形的槽位替身）。
// T6-A Task 7: BrandFace 消费侧契约冻结——shell/layout boot 链的品牌注入面
// （ctx.brand 服务名；Task 8 落 provider，消费侧仅认此形）。

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

/**
 * Brand injection face for the boot chain (Task 7 consume-side contract; the
 * provider lands with the Task 8 brand implementation). Layout/shell surfaces
 * read `productTitle` only — build-configured product word, no locale edge.
 */
export interface BrandFace {
  /** Product word shown in the browser title and boot surfaces. */
  readonly productTitle: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Brand face provided by the brand plugin (Task 8). */
    brand: BrandFace
  }
}

// ---------------------------------------------------------------------------
// T6-A Task 8: 品牌实现出口（实现体在 ./host.ts——产品词 'Atlas'，品牌系统
// spec 为源）。provider 形 = ctx.provide('brand', …)（web-layout/shell 消费
// ctx.brand；boot 组装面在 layout 激活前调用 provideBrand）。
// ---------------------------------------------------------------------------
export { createBrandFace, provideBrand } from './brand.ts'
export { createThemeSettingsStore, THEME_SETTINGS_STORAGE_KEY, type ThemeSettingsStore } from './host.ts'
export type { ThemeSettingsStorage } from './storage.ts'
