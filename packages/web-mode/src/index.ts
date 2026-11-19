// T6-A Task 8: web-mode —— 产品模式注册表（Code 默认；Atlas seam 新码域）。
// 多产品纲要（atlascode/atlasoffice/atlascomic）的消费侧锚点：boot 组装面以
// resolveMode() 取默认模式，产品面经 registerMode 扩充。注册表为进程内
// 单态（无持久化）；未注册 id 一律 fail-closed 拒绝。

/** One product mode descriptor. */
export interface ProductMode {
  /** Stable mode id ('code' | 'office' | …). */
  id: string
  /** Product word surfaced through the brand face. */
  productTitle: string
  /** Default scope id handed to the connection (Atlas seam: scopeId ↔ storageDir). */
  defaultScopeId: string
}

/** The shipped Code mode — the default for every consumer that asks nothing. */
export const CODE_MODE: ProductMode = Object.freeze({
  id: 'code',
  productTitle: 'Atlas',
  defaultScopeId: 'main',
})

const MODES = new Map<string, ProductMode>([[CODE_MODE.id, CODE_MODE]])

/**
 * Register a product mode. Re-registering an id replaces its descriptor.
 * @param mode - the mode descriptor.
 * @returns the registered descriptor.
 */
export function registerMode(mode: ProductMode): ProductMode {
  MODES.set(mode.id, mode)
  return mode
}

/**
 * Resolve a mode by id; absent id resolves the Code default.
 * @param id - mode id, or undefined for the default.
 * @returns the mode descriptor.
 * @throws when the id is not registered (fail-closed — no silent fallback).
 */
export function resolveMode(id?: string): ProductMode {
  if (id === undefined) return CODE_MODE
  const mode = MODES.get(id)
  if (mode === undefined) throw new Error(`unknown mode: ${id}`)
  return mode
}

/** All registered mode descriptors (registration order, Code first). */
export function listModes(): ProductMode[] {
  return [...MODES.values()]
}

/** Test isolation: restore the registry to the shipped Code-only default. */
export function resetModes(): void {
  MODES.clear()
  MODES.set(CODE_MODE.id, CODE_MODE)
}
