// T6-A Task 4: R5 负腿——dsh 产品服务边剥离证明（ui-settings/shortcuts/locale/
// ui-dockkit/ui-session 词汇 import 断言=0；settings 行/settings-store/locales 文件不移植）。
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(import.meta.dir, '..', 'src')

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* walk(p)
    else yield p
  }
}

const FORBIDDEN_IMPORTS = [
  '@deepseek-ai/dsh-client-ui-settings',
  '@deepseek-ai/dsh-client-shortcuts',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/dsh-host-webserver',
  'ui-dockkit',
  'ui-session',
]

const FORBIDDEN_IDENTIFIERS = ['configForms', 'ctx.slots', 'ctx.locale', 'ctx.shortcuts', 'installFontSizeShortcuts']

describe('R5 negative: product-service edges stripped (audit 必改③ / 自决 10)', () => {
  test('no forbidden package imports anywhere in web-theme src', () => {
    for (const file of walk(SRC)) {
      if (!/\.(ts|tsx)$/.test(file)) continue
      const text = readFileSync(file, 'utf8')
      for (const token of FORBIDDEN_IMPORTS) {
        expect(text.includes(token), `${file} mentions ${token}`).toBe(false)
      }
    }
  })

  test('no dsh service-registry vocabulary identifiers', () => {
    for (const file of walk(SRC)) {
      if (!/\.(ts|tsx)$/.test(file)) continue
      const text = readFileSync(file, 'utf8')
      for (const token of FORBIDDEN_IDENTIFIERS) {
        expect(text.includes(token), `${file} uses ${token}`).toBe(false)
      }
    }
  })

  test('settings-surface files are not ported', () => {
    for (const stripped of [
      'client/AppearanceRow.tsx', 'client/FontFamilyRow.tsx', 'client/FontSettingsGroup.tsx',
      'client/FontSizeRow.tsx', 'client/settings-store.ts', 'client/locales.ts',
    ]) {
      expect(statSync(join(SRC, stripped), { throwIfNoEntry: false })?.isFile() ?? false, stripped).toBe(false)
    }
  })

  test('styles assets present verbatim (fonts + token sheets)', () => {
    for (const asset of [
      'styles/base.css', 'styles/brand-font.css', 'styles/shiki.css', 'styles/scrollbar.css',
      'styles/montserrat-regular.woff2', 'styles/Montserrat-OFL.txt',
    ]) {
      expect(statSync(join(SRC, asset), { throwIfNoEntry: false })?.isFile() ?? false, asset).toBe(true)
    }
  })
})
