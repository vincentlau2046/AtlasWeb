// T6-A Task 7: R5 负腿——dsh 产品服务子包禁入扫描（web-shell + web-layout 双树）。
// 红线：ui-settings / shortcuts / locale / ui-dockkit / ui-session 词汇 import 断言 = 0；
// 边替位后代码标识符面亦不得残留（ctx.locale / ctx.shortcuts / DSH_CLIENT_TITLE /
// HARNESS wordmark）。负腿形 = import 语句 + 代码标识符面（Task 4 裁定：散文
// 剥离说明注释豁免——扫描前剥离注释）。
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOTS = [
  join(import.meta.dir, '..', 'src'),
  join(import.meta.dir, '../../web-layout/src'),
]
const FORBIDDEN_IMPORTS = ['@deepseek-ai/dsh-']
const FORBIDDEN_IDENTIFIERS = [/ctx\.locale\b/, /ctx\.shortcuts\b/, /\bDSH_CLIENT_TITLE\b/, /['"]HARNESS['"]/]

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) out.push(p)
  }
  return out
}

/** 剥离块注释与行注释（散文豁免面；字符串中的 // 不在本仓源中出现面）。 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(?<!:)\/\/[^\n]*/g, '')
}

describe('web-shell/web-layout boundary (R5 negative)', () => {
  test('双树 src：零 dsh 包 import（@deepseek-ai/dsh-* 全命名空间）', () => {
    const violations: string[] = []
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const text = readFileSync(file, 'utf8')
        for (const token of FORBIDDEN_IMPORTS) {
          const re = new RegExp(`(?:from|import)\\s*\\(?\\s*['"][^'"]*${token.replace(/[-/]/g, m => `\\${m}`)}`)
          if (re.test(text)) violations.push(`${file}: ${token}`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  test('双树 src 代码标识符面：locale/shortcuts 消费、DSH_CLIENT_TITLE、HARNESS wordmark 零残留', () => {
    const violations: string[] = []
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const code = stripComments(readFileSync(file, 'utf8'))
        for (const re of FORBIDDEN_IDENTIFIERS) {
          if (re.test(code)) violations.push(`${file}: ${re.source}`)
        }
      }
    }
    expect(violations).toEqual([])
  })
})
