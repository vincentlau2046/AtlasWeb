// Adapted from dsh@dsh-v0.2.2-rc.2 (T6-A Task 4): 适配改写形——自 dsh client/index.ts
// 抽核 ThemeRuntime 与主题定义面。边替换（回审裁定形）：
//   settings edge → brand slot（dsh ConfigForm<ThemeSettings> → @atlasweb/web-brand
//   `ThemeSettingsHost<ThemeSettings>`，操作性 4 成员 subscribe/getSnapshot/set/mutate 逐字对齐）；
//   shortcuts edge（桌面字号快捷键注册块）→ 剥离（禁入 R5，登记债候后续波以 Atlas 快捷键面回补）；
//   locale / settings-rows / slots 注册 → 剥离（Task 7 boot kernel 组装面）。
// 保留：注册表/preference/fontSizes/overrideTokens 层叠/snapshot/media 感知/theme-change
// 事件/图标替换校验——逻辑逐字。
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ThemeSettingsHost } from '@atlasweb/web-brand'
import { ICON_SYMBOLS, type IconSymbolId } from '@atlasweb/web-primitives'
import {
  DEFAULT_FONT_SIZES, DEFAULT_PREFERENCE, FONT_FAMILY_FIELDS, FONT_ROLES, FONT_SIZE_SPECS,
  fontFamilyVariable, isFontSize, isThemePreference, normalizeFontFamily, sectionFontSizes,
  THEME_PREFERENCE_FIELD, type FontFamilies, type FontRole, type FontSizes, type ThemePreference, type ThemeSettings,
} from '../theme-settings.ts'

/** Theme token dictionary: --dsw-alias-* overrides keyed by variable name. */
export type ThemeTokens = Record<string, string>

/**
 * One override-layer token value: both palette modes are mandatory (repeat
 * the same value when the token is scheme-invariant) so an override never
 * goes illegible when the user switches to the other scheme.
 */
export interface ThemeTokenModes {
  /** Value applied while the light base palette is active. */
  light: string
  /** Value applied while the dark base palette is active. */
  dark: string
}

/** Override-layer dictionary: token names to per-mode value pairs. */
export type ThemeTokenOverrides = Record<string, ThemeTokenModes>

/** One selectable theme: id, dark/light semantics, and alias-token overrides. */
export interface ThemeDefinition {
  /** Theme id (the setTheme argument for concrete themes). */
  id: string
  /**
   * Which base palette this theme builds on. The presenter switches
   * `body[data-ds-dark-theme]` from this field — never from the id.
   */
  colorScheme: 'light' | 'dark'
  /** Alias-layer overrides applied as inline CSS variables over the base palette. */
  tokens: ThemeTokens
  /**
   * Product icon replacements: ui-primitives `ICON_SYMBOLS` ids to complete
   * SVG documents, trusted like the registering plugin's code. The icon
   * sprite renders each replacement as that id's `<symbol>`: the root's
   * `viewBox` and presentation attributes carry over, its `width`, `height`,
   * `class`, and `aria-hidden` are ignored because the use site sizes the
   * icon, and painted elements inherit `currentColor` and CSS variables from
   * the use site. Gradients and other paint servers resolve their stops in
   * the sprite, which sits in `body`, so they follow palette tokens but not
   * use-site overrides. Each document needs an SVG-namespace root with a
   * `viewBox`, no `<style>` or `<script>` (they would apply to the whole
   * document), and element ids prefixed with `<symbol id>-`.
   */
  icons?: IconReplacements | undefined
}

/** Icon replacement table: ui-primitives symbol ids to complete SVG documents. */
export type IconReplacements = Readonly<Partial<Record<IconSymbolId, string>>>

/** Immutable theme state published on every change. */
export interface ThemeSnapshot {
  /** The persisted preference (may be `system`). */
  preference: ThemePreference
  /** Integer px font sizes by role, each within its `FONT_SIZE_SPECS` range (`text` is the conversation content size). */
  fontSizes: FontSizes
  /** Normalized user font lists by role; `''` selects the role's built-in stack. */
  fontFamilies: FontFamilies
  /**
   * The resolved active theme (`system` resolved via prefers-color-scheme)
   * with override layers folded into its tokens (seq order, later layers win
   * per-token; each value picked for the active color scheme).
   */
  active: ThemeDefinition
  /** Registered themes in registration order. */
  themes: readonly ThemeDefinition[]
  /** Monotonic change counter (registry or active changes). */
  revision: number
}

/** One theme token exposed to pre-definition Cordis inspection. */
export interface ThemeTokenInspection {
  /** Token name accepted by {@link ThemeRuntime.overrideTokens}. */
  name: string
  /** Intended visual role. */
  description: string
  /** CSS value category. */
  valueType: string
  /** Whether override layers must supply both palette modes. */
  requiresLightAndDark: boolean
  /** CSS custom property consumed by UI styles. */
  cssVariable?: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    theme: ThemeRuntime
  }
  interface Events {
    /**
     * Theme state changed (preference switched, registry updated, or the OS
     * color scheme changed while the preference is `system`).
     * @param snapshot - Current immutable theme snapshot.
     * @mode emit
     */
    'theme/change'(snapshot: ThemeSnapshot): void
  }
}

const BUILTIN_THEMES: readonly ThemeDefinition[] = Object.freeze([
  Object.freeze({ id: 'light', colorScheme: 'light' as const, tokens: Object.freeze({}) }),
  Object.freeze({ id: 'dark', colorScheme: 'dark' as const, tokens: Object.freeze({}) }),
])

const BUILTIN_INSPECT_TOKENS: readonly ThemeTokenInspection[] = Object.freeze([
  { name: '--dsw-alias-bg-base', description: 'Application base background.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-alias-bg-base' },
  { name: '--dsw-alias-bg-layer-1', description: 'Primary raised surface background.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-alias-bg-layer-1' },
  { name: '--dsw-alias-bg-layer-2', description: 'Secondary nested surface background.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-alias-bg-layer-2' },
  { name: '--dsw-alias-bg-overlay', description: 'Overlay and popover background.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-alias-bg-overlay' },
  { name: '--dsw-alias-border-l1', description: 'Primary subtle border.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-alias-border-l1' },
  { name: '--dsw-alias-border-l2', description: 'Secondary stronger border.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-alias-border-l2' },
  { name: '--dsw-alias-brand-primary', description: 'Primary brand accent.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-alias-brand-primary' },
  { name: '--dsw-alias-label-primary', description: 'Primary text color.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-alias-label-primary' },
  { name: '--dsw-alias-label-secondary', description: 'Secondary text color.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-alias-label-secondary' },
  { name: '--dsw-alias-state-error-primary', description: 'Primary error state color.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-alias-state-error-primary' },
  { name: '--dsw-alias-state-idle-primary', description: 'Primary inactive state color.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-alias-state-idle-primary' },
  { name: '--dsw-alias-state-success-primary', description: 'Primary success state color.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-alias-state-success-primary' },
  { name: '--dsw-alias-state-warn-primary', description: 'Primary warning state color.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-alias-state-warn-primary' },
  { name: '--dsw-specific-sidebar-fill', description: 'Sidebar column and title-row background.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-specific-sidebar-fill' },
])

/**
 * Theme registry and preference owner. `light`/`dark` are built in (the base
 * stylesheets carry both palettes); third-party themes register alias-layer
 * overrides. Reads go through {@link getTheme}; preference writes only
 * through {@link setTheme}; continuous sync only through the `theme/change`
 * event. {@link overrideTokens} stacks partial token layers over the active
 * theme without touching the registry.
 * The service holds the `prefers-color-scheme` media query (environment
 * sensing, not presentation) and re-emits when the OS scheme flips while the
 * preference is `system`.
 */
export class ThemeRuntime {
  private readonly ctx: ClientContext
  private readonly host: ThemeSettingsHost<ThemeSettings>
  private themes: ThemeDefinition[] = [...BUILTIN_THEMES]
  private preference: ThemePreference
  private fontSizes: FontSizes = bootstrapFontSizes()
  private fontFamilies: FontFamilies = bootstrapFontFamilies()
  private revision = 0
  /** Own settings writes not yet settled; adoption waits for zero so a Host echo of an earlier write cannot revert a later local change. */
  private pendingWrites = 0
  private snapshot: ThemeSnapshot
  private readonly media: MediaQueryList | undefined
  /** Override layers by source; seq (monotonic) is the stacking order. */
  private readonly overrides = new Map<string, { seq: number; tokens: ThemeTokenOverrides }>()
  private overrideSeq = 0

  /**
   * @param ctx - owning context (change events are emitted on it; the
   * media-query and scope listeners are released through ctx.effect on dispose).
   * @param host - durable preference scope owned by the same plugin (brand slot).
   */
  constructor(ctx: ClientContext, host: ThemeSettingsHost<ThemeSettings>) {
    this.ctx = ctx
    this.host = host
    this.preference = bootstrapPreference()
    // Non-browser runs (node e2e booting the client tree) have no matchMedia.
    this.media = typeof matchMedia === 'undefined' ? undefined : matchMedia('(prefers-color-scheme: dark)')
    this.snapshot = this.buildSnapshot()
    if (this.media !== undefined) {
      const media = this.media
      const onChange = (): void => {
        if (this.preference !== 'system') return
        this.publish()
      }
      ctx.effect(() => {
        media.addEventListener('change', onChange)
        return () => { media.removeEventListener('change', onChange) }
      }, 'ui-theme: prefers-color-scheme listener')
    }
    ctx.effect(() => host.subscribe(() => { this.adopt() }), 'ui-theme: settings scope adoption')
    this.adopt()
  }

  /**
   * Read the current immutable theme snapshot.
   * @returns the current snapshot (stable reference until the next change).
   */
  getTheme(): ThemeSnapshot {
    return this.snapshot
  }

  /**
   * Export the current token directory without reading DOM or computed styles.
   * @returns stable JSON-safe token descriptions, including registered and override-only names.
   */
  exportInspectTokens(): ThemeTokenInspection[] {
    const tokens = new Map(BUILTIN_INSPECT_TOKENS.map(token => [token.name, token]))
    for (const theme of this.themes) {
      for (const name of Object.keys(theme.tokens)) {
        if (!tokens.has(name)) tokens.set(name, dynamicToken(name))
      }
    }
    for (const layer of this.overrides.values()) {
      for (const name of Object.keys(layer.tokens)) {
        if (!tokens.has(name)) tokens.set(name, dynamicToken(name))
      }
    }
    return [...tokens.values()].map(token => ({ ...token })).sort((left, right) => left.name.localeCompare(right.name))
  }

  /**
   * Switch the theme preference — the only user preference write entry.
   * Built-in preferences are written through the settings scope and every
   * accepted value emits `theme/change`.
   * @param id - a registered theme id or `system`; unknown ids throw.
   */
  setTheme(id: string): void {
    if (id !== 'system' && !this.themes.some(t => t.id === id)) {
      throw new Error(`theme "${id}" is not registered`)
    }
    if (this.preference === id) return
    this.preference = id as ThemePreference
    if (isThemePreference(id)) this.write(() => this.host.set(THEME_PREFERENCE_FIELD, id))
    this.publish()
  }

  /**
   * Change one role's font size. Accepted
   * values are written through the settings scope and emit `theme/change`.
   * @param role - font role.
   * @param px - integer px within the role's `FONT_SIZE_SPECS` range; out-of-range or fractional values throw.
   */
  setFontSize(role: FontRole, px: number): void {
    const spec = FONT_SIZE_SPECS[role]
    if (!isFontSize(role, px)) throw new Error(`${role} font size ${px} is outside ${spec.min}..${spec.max}`)
    if (this.fontSizes[role] === px) return
    this.fontSizes = Object.freeze({ ...this.fontSizes, [role]: px })
    this.write(() => this.host.set(spec.field, px))
    this.publish()
  }

  /**
   * Change one role's font list — the only font-family write entry. The value
   * is normalized, written through the settings scope, and emits `theme/change`
   * when the normalized list differs.
   * @param role - font role.
   * @param value - comma-separated family names; a value without names restores the built-in stack.
   */
  setFontFamily(role: FontRole, value: string): void {
    const list = normalizeFontFamily(value)
    if (this.fontFamilies[role] === list) return
    this.fontFamilies = Object.freeze({ ...this.fontFamilies, [role]: list })
    this.write(() => this.host.set(FONT_FAMILY_FIELDS[role], list))
    this.publish()
  }

  /** Queue one settings write, then adopt the durable section once no own write remains. */
  private write(operation: () => Promise<boolean>): void {
    this.pendingWrites += 1
    void operation().finally(() => {
      this.pendingWrites -= 1
      this.adopt()
    })
  }

  /** Adopt the scope's accepted durable preference without writing it back. */
  private adopt(): void {
    if (this.pendingWrites > 0) return
    const section = this.host.getSnapshot().value
    if (section === undefined) return
    const fontFamilies = durableFontFamilies(section)
    const fontSizes = sectionFontSizes(section)
    if (this.preference === section.preference
      && FONT_ROLES.every(role => this.fontSizes[role] === fontSizes[role] && this.fontFamilies[role] === fontFamilies[role])) return
    this.preference = section.preference
    this.fontSizes = fontSizes
    this.fontFamilies = fontFamilies
    this.publish()
  }

  /**
   * Register a theme. Duplicate id throws (single occupant per id; the
   * built-in pair counts; `system` is a preference, not a registrable id).
   * @param definition - theme id, colorScheme, alias-token overrides, and
   * optional icon replacements; the runtime keeps a frozen copy of `icons`.
   * Invalid icon replacements throw a `TypeError` naming the theme and icon.
   * @returns disposer. Disposing the theme backing the active preference
   * resets the preference to the default so the UI never keeps tokens of an
   * unregistered theme.
   */
  register(definition: ThemeDefinition): () => void {
    if (definition.id === 'system') throw new Error('"system" is a preference, not a registrable theme id')
    if (this.themes.some(t => t.id === definition.id)) {
      throw new Error(`theme "${definition.id}" is already registered`)
    }
    const icons = validateIcons(definition)
    this.themes = [...this.themes, Object.freeze({ ...definition, icons })]
    this.publish()
    return () => {
      if (!this.themes.some(t => t.id === definition.id)) return
      this.themes = this.themes.filter(t => t.id !== definition.id)
      if (this.preference === definition.id) {
        this.preference = DEFAULT_PREFERENCE
      }
      this.publish()
    }
  }

  /**
   * Stack a token override layer on top of the active theme — the token-level
   * analogue of slot shading: the base theme stays untouched, layers compose
   * in seq order with later layers winning per-token, and removing a layer
   * restores whatever it covered. Calling again with the same source replaces
   * that source's whole layer and restacks it on top (effect re-registration
   * semantics). Emits `theme/change` with the recomposed snapshot.
   * @param source - layer identity; one layer per source (dynamic packages
   * pass their package id — the façade pins it, so it also names the layer's
   * origin for inspection).
   * @param tokens - token-name → `{ light, dark }` value pairs. Validated at
   * runtime (model-authored callers reach this boundary with untyped JS);
   * a bare string value throws a teaching error.
   * @returns disposer removing exactly the layer this call created; a no-op
   * once the source has re-overridden (the newer layer is not torn down).
   */
  overrideTokens(source: string, tokens: ThemeTokenOverrides): () => void {
    const layer = { seq: this.overrideSeq++, tokens: validateOverrides(source, tokens) }
    this.overrides.set(source, layer)
    this.publish()
    return () => {
      if (this.overrides.get(source) !== layer) return
      this.overrides.delete(source)
      this.publish()
    }
  }

  private buildSnapshot(): ThemeSnapshot {
    const resolvedId = this.preference === 'system'
      ? (this.media?.matches === true ? 'dark' : 'light')
      : this.preference
    // Both built-ins always exist; a registered preference id resolves or has
    // been reset by its disposer, so the lookup cannot miss.
    const active = this.themes.find(t => t.id === resolvedId)
    /* v8 ignore next 2 -- needs a registry without light/dark, which register()/dispose() cannot produce */
    if (active === undefined) throw new Error(`theme registry lost "${resolvedId}"`)
    return Object.freeze({
      preference: this.preference,
      fontSizes: this.fontSizes,
      fontFamilies: this.fontFamilies,
      active: this.composeActive(active),
      themes: Object.freeze([...this.themes]),
      revision: this.revision,
    })
  }

  /**
   * Fold the override layers into the active definition: seq order, later
   * layers win per-token, each value picked for the active color scheme (the
   * presenter consumes the composed snapshot and needs no override awareness).
   * Without layers the registered definition passes through by identity.
   */
  private composeActive(active: ThemeDefinition): ThemeDefinition {
    if (this.overrides.size === 0) return active
    const tokens: ThemeTokens = { ...active.tokens }
    for (const layer of [...this.overrides.values()].sort((a, b) => a.seq - b.seq)) {
      for (const [name, modes] of Object.entries(layer.tokens)) {
        tokens[name] = modes[active.colorScheme]
      }
    }
    return Object.freeze({ ...active, tokens: Object.freeze(tokens) })
  }

  private publish(): void {
    this.revision += 1
    this.snapshot = this.buildSnapshot()
    this.ctx.emit('theme/change', this.snapshot)
  }
}

/** Preserve the Host boot palette while the settings scope is loading. */
function bootstrapPreference(): ThemePreference {
  /* v8 ignore next -- documentless client compositions have no boot injection */
  if (typeof document === 'undefined') return DEFAULT_PREFERENCE
  const preference = document.documentElement.dataset.dsThemeSource
  return isThemePreference(preference) ? preference : DEFAULT_PREFERENCE
}

/**
 * Read the font sizes the Host boot script wrote on `body` before any plugin
 * ran, so the initial snapshot matches first paint and ui-layout's presenter
 * does not flash the schema defaults while the settings read is in flight.
 * Non-browser runs, mounts without the boot script, and out-of-range values
 * fall back to each role's default; the durable settings adoption still lands afterwards.
 */
function bootstrapFontSizes(): FontSizes {
  /* v8 ignore next -- needs a documentless run (node e2e booting the client tree), not constructible under jsdom */
  if (typeof document === 'undefined') return DEFAULT_FONT_SIZES
  const read = (role: FontRole): number => {
    const parsed = Number.parseInt(document.body.style.getPropertyValue(FONT_SIZE_SPECS[role].variable), 10)
    return isFontSize(role, parsed) ? parsed : FONT_SIZE_SPECS[role].default
  }
  return Object.freeze({ text: read('text'), code: read('code'), terminal: read('terminal') })
}

/** Font lists the Host boot script wrote on `body`, read for the same first-paint reason as {@link bootstrapFontSizes}. */
function bootstrapFontFamilies(): FontFamilies {
  /* v8 ignore next -- needs a documentless run (node e2e booting the client tree), not constructible under jsdom */
  if (typeof document === 'undefined') return Object.freeze({ text: '', code: '', terminal: '' })
  const style = document.body.style
  return Object.freeze({
    text: normalizeFontFamily(style.getPropertyValue(fontFamilyVariable('text'))),
    code: normalizeFontFamily(style.getPropertyValue(fontFamilyVariable('code'))),
    terminal: normalizeFontFamily(style.getPropertyValue(fontFamilyVariable('terminal'))),
  })
}

/** Normalized font lists from one accepted settings section (hand-edited documents may hold raw input). */
function durableFontFamilies(section: ThemeSettings): FontFamilies {
  return Object.freeze({
    text: normalizeFontFamily(section.textFontFamily),
    code: normalizeFontFamily(section.codeFontFamily),
    terminal: normalizeFontFamily(section.terminalFontFamily),
  })
}

/**
 * Runtime shape check for one override layer (model-authored callers pass
 * untyped JS through the dynamic-package façade, so the static type cannot
 * enforce the pair shape there). Returns a defensive per-token copy so later
 * caller mutation cannot reach the stored layer.
 */function validateOverrides(source: string, tokens: ThemeTokenOverrides): ThemeTokenOverrides {
  const validated: ThemeTokenOverrides = {}
  for (const [name, value] of Object.entries<unknown>(tokens)) {
    if (typeof value === 'string') {
      throw new TypeError(
        `theme override "${name}" from "${source}" is a bare string — pass { light: ${JSON.stringify(value)}, dark: ${JSON.stringify(value)} } `
        + '(repeat the value when it is the same in both palettes); a single value goes illegible when the user switches color scheme',
      )
    }
    if (typeof value !== 'object' || value === null
      || typeof (value as { light?: unknown }).light !== 'string'
      || typeof (value as { dark?: unknown }).dark !== 'string') {
      throw new TypeError(
        `theme override "${name}" from "${source}" must map to a { light, dark } pair of strings — one value per color scheme`,
      )
    }
    const modes = value as ThemeTokenModes
    validated[name] = { light: modes.light, dark: modes.dark }
  }
  return validated
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Reject icon replacements a sprite cannot render (untyped dynamic-package
 * callers reach this boundary, as with {@link validateOverrides}): unknown
 * symbol ids, documents without an SVG-namespace `<svg viewBox>` root,
 * document-wide `<style>` or `<script>`, and element ids outside the
 * symbol's own `<symbol id>-` namespace.
 * @returns a frozen copy of the replacements, or undefined when there are none.
 */
function validateIcons({ id, icons }: ThemeDefinition): IconReplacements | undefined {
  // Untyped callers may pass null; treat it like an absent field.
  if (icons == null) return undefined
  const copy: Partial<Record<IconSymbolId, string>> = {}
  for (const [name, markup] of Object.entries<unknown>(icons)) {
    const fail = (problem: string): never => { throw new TypeError(`theme "${id}" icon "${name}" ${problem}`) }
    if (!Object.hasOwn(ICON_SYMBOLS, name)) fail('is not an ICON_SYMBOLS id')
    if (typeof markup !== 'string') fail('must be an SVG document string')
    copy[name as IconSymbolId] = markup as string
    /* v8 ignore next -- needs a documentless run (node e2e booting the client tree), where no sprite renders either */
    if (typeof DOMParser === 'undefined') continue
    const root = new DOMParser().parseFromString(markup as string, 'image/svg+xml').documentElement
    if (root.namespaceURI !== SVG_NS || root.localName !== 'svg' || root.querySelector('parsererror') !== null) fail('is not a well-formed SVG-namespace <svg> document')
    if (!root.hasAttribute('viewBox')) fail('needs a viewBox')
    if (root.querySelector('style, script') !== null) fail('must not contain <style> or <script>')
    for (const element of root.querySelectorAll('[id]')) {
      if (!element.id.startsWith(`${name}-`)) fail(`element id "${element.id}" must start with "${name}-"`)
    }
  }
  return Object.freeze(copy)
}

function dynamicToken(name: string): ThemeTokenInspection {
  return {
    name,
    description: 'Theme token registered by the current Client composition.',
    valueType: 'CSS value',
    requiresLightAndDark: true,
    ...(name.startsWith('--') ? { cssVariable: name } : {}),
  }
}
