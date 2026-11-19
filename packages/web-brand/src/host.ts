// T6-A Task 8: durable 主题设置传输（web-theme ThemeRuntime 消费契约的实现体）。
// dsh settings scope 的操作性替身：快照读/变更订阅/单字段写/批量写四成员逐字
// 对齐 ThemeSettingsHost；持久化经注入 storage 缝（浏览器 boot 传 localStorage，
// 缺省内存态），未知字段/越界值一律 fail-closed 拒绝。节在首次接受写时物化，
// 合并到主题默认值上。refresh() = Atlas 扩展（外源写采纳缝；ThemeRuntime 只
// 消费四成员契约，结构超类型直接满足）。
import {
  FONT_FAMILY_FIELDS, FONT_SIZE_SPECS, THEME_PREFERENCE_FIELD,
  isFontSize, isThemePreference, normalizeFontFamily,
  type ThemeSettings,
} from '@atlasweb/web-theme'
import type { ThemeSettingsStorage } from './storage.ts'

/** Storage key for the durable theme settings document. */
export const THEME_SETTINGS_STORAGE_KEY = 'atlasweb:ui-theme'

/** The durable host plus the external-write adoption seam (Atlas extension). */
export interface ThemeSettingsStore extends ThemeSettingsHost<ThemeSettings> {
  /** Re-read the storage seam and notify on change (external write adoption). */
  refresh(): void
}

/** Theme defaults the first accepted write merges onto. */
function defaultSection(): ThemeSettings {
  return {
    preference: 'system',
    fontSize: FONT_SIZE_SPECS.text.default,
    codeFontSize: FONT_SIZE_SPECS.code.default,
    terminalFontSize: FONT_SIZE_SPECS.terminal.default,
    textFontFamily: '',
    codeFontFamily: '',
    terminalFontFamily: '',
  }
}

/** Field validation/normalization for one accepted write; undefined = reject. */
function normalizeField(field: string, value: unknown): unknown | undefined {
  switch (field) {
    case THEME_PREFERENCE_FIELD:
      return isThemePreference(value) ? value : undefined
    case FONT_SIZE_SPECS.text.field:
    case FONT_SIZE_SPECS.code.field:
    case FONT_SIZE_SPECS.terminal.field: {
      const role = field === FONT_SIZE_SPECS.text.field
        ? 'text'
        : field === FONT_SIZE_SPECS.code.field ? 'code' : 'terminal'
      return typeof value === 'number' && isFontSize(role, value) ? value : undefined
    }
    case FONT_FAMILY_FIELDS.text:
    case FONT_FAMILY_FIELDS.code:
    case FONT_FAMILY_FIELDS.terminal:
      return typeof value === 'string' ? normalizeFontFamily(value) : undefined
    default:
      return undefined
  }
}

/**
 * Create the durable theme settings transport backing the ThemeRuntime
 * (provideThemeRuntime's host argument).
 * @param options - storage seam override (browser boot passes localStorage).
 * @returns the store (host + refresh seam).
 */
export function createThemeSettingsStore(options?: { storage?: ThemeSettingsStorage }): ThemeSettingsStore {
  const storage = options?.storage ?? memoryStorage()
  const listeners = new Set<() => void>()
  const notify = (): void => { for (const listener of listeners) listener() }

  let value: ThemeSettings | undefined
  let loaded = false
  const load = (): void => {
    if (loaded) return
    loaded = true
    try {
      const raw = storage.getItem(THEME_SETTINGS_STORAGE_KEY)
      if (raw === null) return
      const parsed = JSON.parse(raw) as Partial<ThemeSettings>
      if (parsed === null || typeof parsed !== 'object') return
      const defaults = defaultSection()
      value = {
        preference: isThemePreference(parsed.preference) ? parsed.preference : defaults.preference,
        fontSize: typeof parsed.fontSize === 'number' && isFontSize('text', parsed.fontSize) ? parsed.fontSize : defaults.fontSize,
        codeFontSize: typeof parsed.codeFontSize === 'number' && isFontSize('code', parsed.codeFontSize) ? parsed.codeFontSize : defaults.codeFontSize,
        terminalFontSize: typeof parsed.terminalFontSize === 'number' && isFontSize('terminal', parsed.terminalFontSize) ? parsed.terminalFontSize : defaults.terminalFontSize,
        textFontFamily: typeof parsed.textFontFamily === 'string' ? parsed.textFontFamily : '',
        codeFontFamily: typeof parsed.codeFontFamily === 'string' ? parsed.codeFontFamily : '',
        terminalFontFamily: typeof parsed.terminalFontFamily === 'string' ? parsed.terminalFontFamily : '',
      }
    } catch {
      value = undefined // corrupt payload fails closed; the section stays writable
    }
  }
  const persist = (): void => {
    if (value !== undefined) storage.setItem(THEME_SETTINGS_STORAGE_KEY, JSON.stringify(value))
  }
  const apply = (field: string, normalized: unknown): void => {
    value = { ...(value ?? defaultSection()), [field]: normalized }
  }

  return {
    subscribe(fn: () => void): () => void {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    },
    getSnapshot(): { value: ThemeSettings | undefined } {
      load()
      return { value }
    },
    async set(field: string, fieldValue: unknown): Promise<boolean> {
      load()
      const normalized = normalizeField(field, fieldValue)
      if (normalized === undefined) return false
      apply(field, normalized)
      persist()
      notify()
      return true
    },
    async mutate(ops: Array<{ op: 'set'; path: Array<string | number>; value: unknown }>): Promise<boolean> {
      load()
      // Atomic: validate every op before applying any.
      const validated: Array<[string, unknown]> = []
      for (const op of ops) {
        if (op.op !== 'set' || op.path.length !== 1 || typeof op.path[0] !== 'string') return false
        const normalized = normalizeField(op.path[0], op.value)
        if (normalized === undefined) return false
        validated.push([op.path[0], normalized])
      }
      for (const [field, normalized] of validated) apply(field, normalized)
      persist()
      notify()
      return true
    },
    refresh(): void {
      const before = value
      loaded = false
      load()
      if (before !== value) notify()
    },
  }
}

/** In-memory fallback storage (headless hosts, tests). */
function memoryStorage(): ThemeSettingsStorage {
  const map = new Map<string, string>()
  return {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value) },
  }
}
