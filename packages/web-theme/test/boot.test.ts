// T6-A Task 4: boot-theme 注入行腿（pre-plugin 首涂调色板 + 字体变量 body 脚本）。
import { describe, expect, test } from 'bun:test'

describe('bootThemeInjections', () => {
  test('default (system): head style + body script rows in order', async () => {
    const { bootThemeInjections } = await import('../src/boot-theme.ts')
    const rows = bootThemeInjections()
    expect(rows.length).toBe(2)
    expect(rows[0]).toMatchObject({ kind: 'style' })
    expect((rows[0] as { text: string }).text).toContain(':root{color-scheme:light}')
    expect((rows[0] as { text: string }).text).toContain('@media(prefers-color-scheme:dark)')
    expect(rows[1]).toMatchObject({ kind: 'script', placement: 'body' })
    const script = (rows[1] as { text: string }).text
    expect(script).toContain('data-ds-dark-theme')
    expect(script).toContain('"--dsh-content-font-size"')
    expect(script).toContain('"14px"')
    expect(script).toContain('prefers-color-scheme: dark')
  })

  test('light/dark: no media query in style row', async () => {
    const { bootThemeInjections } = await import('../src/boot-theme.ts')
    const light = bootThemeInjections('light')
    expect((light[0] as { text: string }).text).not.toContain('@media')
    expect((light[0] as { text: string }).text).toContain('#fff')
    const dark = bootThemeInjections('dark')
    expect((dark[0] as { text: string }).text).not.toContain('@media')
    expect((dark[0] as { text: string }).text).toContain('#151517')
  })

  test('font families normalized and embedded quoted', async () => {
    const { bootThemeInjections } = await import('../src/boot-theme.ts')
    const rows = bootThemeInjections('light', { text: 14, code: 11, terminal: 13 }, { text: 'My Font, monospace', code: '', terminal: '' })
    const script = (rows[1] as { text: string }).text
    expect(script).toContain('"--dsh-font-family-text"')
    expect(script).toContain('\\"My Font\\", monospace')
    // 空列表不嵌入
    expect(script).not.toContain('--dsh-font-family-code')
  })
})
