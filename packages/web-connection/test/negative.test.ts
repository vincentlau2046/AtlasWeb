// T6-A Task 6: R5 负腿——边界红线扫描。
// 红线 1：`@atlasharness/*` 仅 web-host 可 import（web-connection = 消费侧，零上游依赖）。
// 红线 2：适配器不得 import web-host 源（它是线缆对端，非依赖；唯一耦合 = wire 协议形）。
// 负腿形 = import 语句 + 代码标识符面（Task 4 裁定：散文剥离说明注释豁免）。
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC_ROOT = join(import.meta.dir, '..', 'src')
const FORBIDDEN_IMPORTS = ['@atlasharness/', '@atlasweb/web-host']

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (p.endsWith('.ts')) out.push(p)
  }
  return out
}

describe('web-connection boundary (R5 negative)', () => {
  test('src has zero @atlasharness/* and zero web-host imports', () => {
    const files = walk(SRC_ROOT)
    expect(files.length).toBeGreaterThan(0)
    const violations: string[] = []
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      for (const token of FORBIDDEN_IMPORTS) {
        const re = new RegExp(`(?:from|import)\\s*\\(?\\s*['"][^'"]*${token.replace('/', '\\/')}`)
        if (re.test(text)) violations.push(`${file}: ${token}`)
      }
    }
    expect(violations).toEqual([])
  })
})
