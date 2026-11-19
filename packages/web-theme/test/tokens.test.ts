// T6-A Task 4: 主题 token 源行为腿（theme-settings.ts——schemastery 边走 vendor 路径别名，verbatim）。
import { describe, expect, test } from 'bun:test'

describe('theme-settings token contract', () => {
  test('preference vocabulary and defaults', async () => {
    const t = await import('../src/theme-settings.ts')
    expect([...t.THEME_PREFERENCES]).toEqual(['light', 'dark', 'system'])
    expect(t.DEFAULT_PREFERENCE).toBe('system')
    expect(t.THEME_SETTINGS_NAMESPACE).toBe('ui-theme')
    expect(t.THEME_PREFERENCE_FIELD).toBe('preference')
    expect(t.FONT_SIZE_FIELD).toBe('fontSize')
  })

  test('font size specs and boundaries', async () => {
    const t = await import('../src/theme-settings.ts')
    expect(t.FONT_SIZE_SPECS.text).toMatchObject({ variable: '--dsh-content-font-size', min: 10, max: 22, default: 14 })
    expect(t.FONT_SIZE_SPECS.code).toMatchObject({ variable: '--dsh-code-font-size', min: 10, max: 16, default: 11 })
    expect(t.FONT_SIZE_SPECS.terminal).toMatchObject({ variable: '--dsh-terminal-font-size', min: 10, max: 20, default: 13 })
    expect(t.DEFAULT_FONT_SIZES).toEqual({ text: 14, code: 11, terminal: 13 })
    expect(t.isFontSize('text', 10)).toBe(true)
    expect(t.isFontSize('text', 22)).toBe(true)
    expect(t.isFontSize('text', 9)).toBe(false)
    expect(t.isFontSize('text', 23)).toBe(false)
    expect(t.isFontSize('text', 14.5)).toBe(false)
    expect(t.isFontSize('code', 16)).toBe(true)
    expect(t.isFontSize('code', 17)).toBe(false)
  })

  test('fontFamilyVariable names per role', async () => {
    const t = await import('../src/theme-settings.ts')
    expect(t.fontFamilyVariable('text')).toBe('--dsh-font-family-text')
    expect(t.fontFamilyVariable('code')).toBe('--dsh-font-family-code')
    expect(t.fontFamilyVariable('terminal')).toBe('--dsh-font-family-terminal')
  })

  test('normalizeFontFamily quoting and sanitization', async () => {
    const t = await import('../src/theme-settings.ts')
    expect(t.normalizeFontFamily('Foo')).toBe('"Foo"')
    expect(t.normalizeFontFamily('serif')).toBe('serif')
    expect(t.normalizeFontFamily('system-ui')).toBe('system-ui')
    expect(t.normalizeFontFamily(' a , b ')).toBe('"a", "b"')
    expect(t.normalizeFontFamily('O"Brien')).toBe('"OBrien"')
    expect(t.normalizeFontFamily('a<b>\\c')).toBe('"abc"')
    expect(t.normalizeFontFamily('')).toBe('')
    // 归一化幂等（结果再归一不变）。
    expect(t.normalizeFontFamily(t.normalizeFontFamily('My Font, monospace'))).toBe(t.normalizeFontFamily('My Font, monospace'))
  })

  test('sectionFontSizes roundtrip and isThemePreference narrowing', async () => {
    const t = await import('../src/theme-settings.ts')
    const section = {
      preference: 'dark' as const, fontSize: 14, codeFontSize: 11, terminalFontSize: 13,
      textFontFamily: '', codeFontFamily: '', terminalFontFamily: '',
    }
    expect(t.sectionFontSizes(section)).toEqual({ text: 14, code: 11, terminal: 13 })
    expect(t.isThemePreference('dark')).toBe(true)
    expect(t.isThemePreference('atlas-light')).toBe(false)
    expect(t.isThemePreference(null)).toBe(false)
  })

  test('fontSizeSchema respects spec bounds (vendor schemastery callable-validation surface)', async () => {
    const t = await import('../src/theme-settings.ts')
    const schema = t.fontSizeSchema(t.FONT_SIZE_SPECS.code) as unknown as (v: number) => number
    expect(schema(11)).toBe(11)
    expect(() => schema(12.5)).toThrow() // step(1) 拒小数
    expect(() => schema(17)).toThrow() // max(16) 拒越界
  })
})
