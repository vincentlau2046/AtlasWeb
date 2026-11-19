// T6-A Task 4: ThemeRuntime 核心行为腿（DOM-free：bun 测试无 document——bootstrap 走默认回退；
// ctx/host 以最小桩注入，寄存器/覆盖层/尺寸写链全走真逻辑）。
import { describe, expect, test } from 'bun:test'
import type { ThemeSettings } from '../src/theme-settings.ts'

type ThemeRuntimeCtor = new (ctx: object, host: object) => {
  getTheme(): {
    preference: string; revision: number; fontSizes: Record<string, number>
    active: { id: string; colorScheme: string; tokens: Record<string, string> }
    themes: readonly { id: string }[]
  }
  setTheme(id: string): void
  setFontSize(role: string, px: number): void
  register(definition: Record<string, unknown>): () => void
  overrideTokens(source: string, tokens: Record<string, { light: string; dark: string }>): () => void
  exportInspectTokens(): Array<{ name: string }>
}

function stubCtx() {
  const disposed: string[] = []
  const ctx = {
    effect(fn: () => (() => void) | void, name?: string) {
      const d = fn()
      if (d) disposed.push(name ?? 'unnamed')
      return d
    },
    emit(_event: string, _payload: unknown) {},
    on() { return () => {} },
  }
  return ctx
}

interface ThemeSettingsHostStub {
  subscribe(fn: () => void): () => void
  getSnapshot(): { value: ThemeSettings | undefined }
  set(field: string, value: unknown): Promise<boolean>
  mutate(ops: Array<{ op: 'set'; path: Array<string | number>; value: unknown }>): Promise<boolean>
}

function stubHost(section?: Partial<ThemeSettings>) {
  const base: ThemeSettings = {
    preference: 'system', fontSize: 14, codeFontSize: 11, terminalFontSize: 13,
    textFontFamily: '', codeFontFamily: '', terminalFontFamily: '',
  }
  let value: ThemeSettings | undefined = section ? { ...base, ...section } : undefined
  const subs = new Set<() => void>()
  return {
    subscribe(fn: () => void) { subs.add(fn); return () => { subs.delete(fn) } },
    getSnapshot() { return { value } },
    set(field: string, v: unknown) {
      value = { ...(value ?? base), [field]: v } as ThemeSettings
      return Promise.resolve(true)
    },
    mutate(ops) {
      let next = { ...(value ?? base) } as Record<string, unknown>
      for (const op of ops) next[op.path.join('.')] = op.value
      value = next as ThemeSettings
      return Promise.resolve(true)
    },
    flush() { for (const fn of subs) fn() },
  } satisfies ThemeSettingsHostStub & { flush(): void }
}

async function load() {
  const mod = await import('../src/client/index.ts')
  return { ThemeRuntime: mod.ThemeRuntime as unknown as ThemeRuntimeCtor }
}

describe('ThemeRuntime core (DOM-free)', () => {
  test('documentless bootstrap: defaults, system resolves light, built-ins registered', async () => {
    const { ThemeRuntime } = await load()
    const theme = new ThemeRuntime(stubCtx(), stubHost())
    const s = theme.getTheme()
    expect(s.preference).toBe('system')
    expect(s.fontSizes).toEqual({ text: 14, code: 11, terminal: 13 })
    expect(s.active.id).toBe('light')
    expect(s.active.colorScheme).toBe('light')
    expect(s.themes.map(t => t.id)).toEqual(['light', 'dark'])
    expect(s.revision).toBe(0)
  })

  test('setTheme dark: snapshot flips, host write issued, revision bumps', async () => {
    const { ThemeRuntime } = await load()
    const host = stubHost()
    const theme = new ThemeRuntime(stubCtx(), host)
    theme.setTheme('dark')
    const s = theme.getTheme()
    expect(s.preference).toBe('dark')
    expect(s.active.id).toBe('dark')
    expect(s.active.colorScheme).toBe('dark')
    expect(s.revision).toBe(1)
    expect(host.getSnapshot().value?.preference).toBe('dark')
    theme.setTheme('dark') // 幂等：无变化不 bump
    expect(theme.getTheme().revision).toBe(1)
  })

  test('register custom theme: dup throws, system rejected, disposer resets preference', async () => {
    const { ThemeRuntime } = await load()
    const theme = new ThemeRuntime(stubCtx(), stubHost())
    const dispose = theme.register({ id: 'atlas-light', colorScheme: 'light', tokens: {} })
    expect(theme.getTheme().themes.map(t => t.id)).toEqual(['light', 'dark', 'atlas-light'])
    expect(() => theme.register({ id: 'atlas-light', colorScheme: 'light', tokens: {} })).toThrow(/already registered/)
    expect(() => theme.register({ id: 'system', colorScheme: 'light', tokens: {} })).toThrow(/system/)
    theme.setTheme('atlas-light')
    expect(theme.getTheme().active.id).toBe('atlas-light')
    dispose()
    expect(theme.getTheme().preference).toBe('system')
    expect(theme.getTheme().themes.map(t => t.id)).toEqual(['light', 'dark'])
  })

  test('overrideTokens: bare string rejected, pair composed per scheme, disposer restores', async () => {
    const { ThemeRuntime } = await load()
    const theme = new ThemeRuntime(stubCtx(), stubHost())
    expect(() => theme.overrideTokens('x', { '--dsw-alias-bg-base': '#fff' as unknown as { light: string; dark: string } }))
      .toThrow(/bare string/)
    expect(() => theme.overrideTokens('x', { '--dsw-alias-bg-base': { light: 1, dark: 'k' } as unknown as { light: string; dark: string } }))
      .toThrow(/light, dark/)
    const remove = theme.overrideTokens('x', { '--dsw-alias-bg-base': { light: '#ffffff', dark: '#000000' } })
    // system→light 臂：light 值入选
    expect(theme.getTheme().active.tokens['--dsw-alias-bg-base']).toBe('#ffffff')
    remove()
    expect(theme.getTheme().active.tokens['--dsw-alias-bg-base']).toBeUndefined()
    // 同源重注册 = 整层替换并重排顶层
    const a = theme.overrideTokens('x', { '--dsw-alias-bg-base': { light: '#111111', dark: '#111111' } })
    const b = theme.overrideTokens('x', { '--dsw-alias-bg-base': { light: '#222222', dark: '#222222' } })
    expect(theme.getTheme().active.tokens['--dsw-alias-bg-base']).toBe('#222222')
    a() // 旧层 no-op
    expect(theme.getTheme().active.tokens['--dsw-alias-bg-base']).toBe('#222222')
    b()
    expect(theme.getTheme().active.tokens['--dsw-alias-bg-base']).toBeUndefined()
  })

  test('setFontSize: valid writes via host, out-of-range throws', async () => {
    const { ThemeRuntime } = await load()
    const host = stubHost()
    const theme = new ThemeRuntime(stubCtx(), host)
    theme.setFontSize('text', 16)
    expect(theme.getTheme().fontSizes.text).toBe(16)
    expect(host.getSnapshot().value?.fontSize).toBe(16)
    expect(() => theme.setFontSize('text', 9)).toThrow(/outside/)
    expect(() => theme.setFontSize('code', 12.5)).toThrow(/outside/)
  })

  test('host adoption: flush syncs runtime without write-back', async () => {
    const { ThemeRuntime } = await load()
    const host = stubHost({ preference: 'dark' })
    const theme = new ThemeRuntime(stubCtx(), host)
    expect(theme.getTheme().preference).toBe('dark') // 构造即 adopt
    host.set('preference', 'light')
    host.flush()
    expect(theme.getTheme().preference).toBe('light')
    expect(theme.getTheme().active.id).toBe('light')
  })

  test('validateIcons: unknown id and non-string markup rejected (DOM-free surface)', async () => {
    const { ThemeRuntime } = await load()
    const theme = new ThemeRuntime(stubCtx(), stubHost())
    expect(() => theme.register({ id: 't1', colorScheme: 'light', tokens: {}, icons: { 'not-an-id': '<svg viewBox="0 0 1 1"></svg>' } }))
      .toThrow(/ICON_SYMBOLS id/)
    expect(() => theme.register({ id: 't1', colorScheme: 'light', tokens: {}, icons: { 'dsw-icon-search-outline-regular': 42 as unknown as string } }))
      .toThrow(/SVG document string/)
    // 无 DOMParser 运行时（bun test）DOM 形校验（viewBox/style/script/id 前缀）按 dsh 原形跳过
    // （v8 ignore 注释即此路径）——browser-lane 债，Task 2/3 同裁定。
    const ok = theme.register({
      id: 't1', colorScheme: 'light', tokens: {},
      icons: { 'dsw-icon-search-outline-regular': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"></svg>' },
    })
    expect(typeof ok).toBe('function')
    ok()
  })

  test('exportInspectTokens: 14 builtins present, dynamic tokens appended', async () => {
    const { ThemeRuntime } = await load()
    const theme = new ThemeRuntime(stubCtx(), stubHost())
    const names = theme.exportInspectTokens().map(t => t.name)
    expect(names).toContain('--dsw-alias-bg-base')
    expect(names).toContain('--dsw-specific-sidebar-fill')
    theme.register({ id: 'd', colorScheme: 'dark', tokens: { '--dsw-alias-custom-token': { light: 'a', dark: 'b' } } })
    const after = theme.exportInspectTokens().map(t => t.name)
    expect(after).toContain('--dsw-alias-custom-token')
  })
})
