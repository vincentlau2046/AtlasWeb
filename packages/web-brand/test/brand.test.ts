// T6-A Task 8 RED: web-brand 品牌实现腿——BrandFace provider + ThemeSettingsHost
// durable 传输（web-theme ThemeRuntime 消费契约，操作性 4 成员）。
import { describe, expect, test } from 'bun:test'
import { Context } from '@deepseek-ai/cordis'
import {
  FONT_FAMILY_FIELDS, FONT_SIZE_SPECS, THEME_PREFERENCES,
  type ThemeSettings,
} from '@atlasweb/web-theme'
import {
  createBrandFace, createThemeSettingsStore, provideBrand,
  type ThemeSettingsStorage,
} from '../src/index.ts'

describe('BrandFace provider', () => {
  test('createBrandFace defaults to the Atlas product word', () => {
    expect(createBrandFace()).toEqual({ productTitle: 'Atlas' })
  })

  test('createBrandFace honors an explicit product title', () => {
    expect(createBrandFace({ productTitle: 'Atlas Office' }).productTitle).toBe('Atlas Office')
  })

  test('provideBrand installs ctx.brand over a live cordis context', () => {
    const ctx = new Context()
    const face = provideBrand(ctx)
    expect(ctx.brand).toBe(face)
    expect(ctx.brand.productTitle).toBe('Atlas')
  })
})

/** In-memory storage seam fixture. */
function memoryStorage(): ThemeSettingsStorage & { dump(): Record<string, string> } {
  const map = new Map<string, string>()
  return {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value) },
    dump: () => Object.fromEntries(map),
  }
}

describe('ThemeSettingsHost durable transport', () => {
  test('a fresh host without a stored section reports value undefined', () => {
    const host = createThemeSettingsStore({ storage: memoryStorage() })
    expect(host.getSnapshot().value).toBeUndefined()
  })

  test('set() accepts a known field, merges onto defaults, and notifies', async () => {
    const host = createThemeSettingsStore({ storage: memoryStorage() })
    let notifications = 0
    const off = host.subscribe(() => { notifications += 1 })
    const accepted = await host.set('preference', THEME_PREFERENCES[1])
    expect(accepted).toBe(true)
    const value = host.getSnapshot().value as ThemeSettings
    expect(value.preference).toBe('dark')
    expect(value.fontSize).toBe(FONT_SIZE_SPECS.text.default)
    expect(notifications).toBe(1)
    off()
    expect(await host.set('preference', 'dark')).toBe(true)
    expect(notifications).toBe(1) // unsubscribed: no further notifications
  })

  test('set() rejects unknown fields and invalid values fail-closed', async () => {
    const host = createThemeSettingsStore({ storage: memoryStorage() })
    expect(await host.set('noSuchField', 1)).toBe(false)
    expect(await host.set('preference', 'sepia')).toBe(false)
    expect(await host.set('fontSize', Number.NaN)).toBe(false)
    expect(await host.set('fontSize', FONT_SIZE_SPECS.text.min - 1)).toBe(false)
    expect(await host.set('fontSize', FONT_SIZE_SPECS.text.max + 1)).toBe(false)
    expect(await host.set('fontSize', 12.5)).toBe(false)
    expect(await host.set(FONT_FAMILY_FIELDS.text, 42)).toBe(false)
    expect(host.getSnapshot().value).toBeUndefined()
  })

  test('set() accepts every role font size within its own spec range', async () => {
    const host = createThemeSettingsStore({ storage: memoryStorage() })
    for (const spec of Object.values(FONT_SIZE_SPECS)) {
      expect(await host.set(spec.field, spec.default)).toBe(true)
    }
    expect(host.getSnapshot().value?.codeFontSize).toBe(FONT_SIZE_SPECS.code.default)
  })

  test('mutate() applies a batch atomically and notifies once', async () => {
    const host = createThemeSettingsStore({ storage: memoryStorage() })
    let notifications = 0
    host.subscribe(() => { notifications += 1 })
    const ok = await host.mutate([
      { op: 'set', path: ['preference'], value: 'light' },
      { op: 'set', path: ['fontSize'], value: 16 },
    ])
    expect(ok).toBe(true)
    const value = host.getSnapshot().value as ThemeSettings
    expect(value.preference).toBe('light')
    expect(value.fontSize).toBe(16)
    expect(notifications).toBe(1)
    const bad = await host.mutate([
      { op: 'set', path: ['fontSize'], value: 18 },
      { op: 'set', path: ['preference'], value: 'mono' },
    ])
    expect(bad).toBe(false)
    expect(host.getSnapshot().value?.fontSize).toBe(16) // atomic: valid op not applied
  })

  test('writes persist through the storage seam and survive host recreation', async () => {
    const storage = memoryStorage()
    const first = createThemeSettingsStore({ storage })
    await first.set('preference', 'dark')
    expect(Object.keys(storage.dump()).length).toBe(1)
    const second = createThemeSettingsStore({ storage })
    expect(second.getSnapshot().value?.preference).toBe('dark')
  })

  test('a corrupt stored payload fails closed to undefined and stays writable', async () => {
    const storage = memoryStorage()
    const [key] = Object.keys(storage.dump())
    storage.setItem('atlasweb:ui-theme', '{not json')
    const host = createThemeSettingsStore({ storage })
    expect(host.getSnapshot().value).toBeUndefined()
    expect(await host.set('preference', 'dark')).toBe(true)
    expect(host.getSnapshot().value?.preference).toBe('dark')
    void key
  })

  test('refresh() adopts external storage writes and notifies subscribers', async () => {
    const storage = memoryStorage()
    const host = createThemeSettingsStore({ storage })
    const other = createThemeSettingsStore({ storage })
    await other.set('fontSize', 20)
    let notifications = 0
    host.subscribe(() => { notifications += 1 })
    host.refresh()
    expect(host.getSnapshot().value?.fontSize).toBe(20)
    expect(notifications).toBe(1)
  })
})
