// T6-A Task 5: 依赖行升格锁定腿（回审裁定 2 可追溯性——16 行恰合 dsh@tag 实测值，
// B 案减 5 行（katex/micromark-extension-math/mdast-util-math/shiki/@shikijs/langs）负腿显式）。
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))

const APPROVED_ROWS: Record<string, string> = {
  '@types/mdast': '^4.0.4',
  anser: '^2.3.5',
  clsx: '^2.0.0',
  diff: '^9.0.0',
  "mdast-util-from-markdown": '^2.0.3',
  "mdast-util-gfm": '^3.1.0',
  "micromark-core-commonmark": '^2.0.3',
  "micromark-extension-gfm": '^3.0.0',
  "micromark-factory-space": '^2.0.1',
  "micromark-util-character": '^2.1.1',
  "micromark-util-classify-character": '^2.0.1',
  "micromark-util-decode-string": '^2.0.1',
  "micromark-util-sanitize-uri": '^2.0.1',
  "micromark-util-symbol": '^2.0.1',
  "micromark-util-types": '^2.0.2',
  'simple-icons': '16.31.0',
}

describe('ruling 2: dependency rows exactly match the audited 16-row table', () => {
  test('external rows deep-equal the approved table; whitelisted rows pinned separately', () => {
    const external = { ...pkg.dependencies }
    delete external['react']
    delete external['react-dom']
    expect(external).toEqual(APPROVED_ROWS)
  })

  test('B-case cut rows are absent (negative leg)', () => {
    for (const cut of ['katex', 'shiki', '@shikijs/langs', 'micromark-extension-math', 'mdast-util-math']) {
      expect(pkg.dependencies[cut]).toBeUndefined()
    }
  })

  test('whitelisted UI rows land at the audit-pinned range; no workspace/other rows', () => {
    // react/react-dom 在白名单（f4 release 2026-11-19）；dsh 侧为 devDeps（tsdown 打包），AtlasWeb bun 直跑即运行时实引。
    expect(pkg.dependencies['react']).toBe('^18.2.0')
    expect(pkg.dependencies['react-dom']).toBe('^18.2.0')
    expect(Object.keys(pkg.dependencies).length).toBe(18)
    expect(pkg.dependencies['@atlasweb/web-store']).toBeUndefined()
  })
})
