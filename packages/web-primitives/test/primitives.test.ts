// T6-A Task 5: web-primitives 冻结清单原子腿（RED 先行）。
// 组件原子 = 导入图 + 导出形状腿（DOM 渲染腿 = 已登记 browser lane 债，Task 2/3 同裁定）；
// 纯函数原子 = 行为腿。
import { describe, expect, test } from 'bun:test'
import * as P from '@atlasweb/web-primitives'

// dsh 组件原子 = 函数或 forwardRef/memo 包装对象（React element type）。
function isElementType(v: unknown): boolean {
  return typeof v === 'function'
    || (typeof v === 'object' && v !== null && (v as { $$typeof?: symbol }).$$typeof !== undefined)
}

describe('freeze-list atom graph', () => {
  test('chrome control atoms are exported function components', () => {
    for (const name of [
      'Button', 'StateDot', 'Pill', 'PathLabel', 'Tag', 'Toast', 'Input', 'Tooltip',
      'TextShimmer', 'ConnectionIndicator', 'DisclosureRow', 'FoldToggle', 'CodeToolbar',
    ] as const) {
      expect(isElementType((P as Record<string, unknown>)[name]), name).toBe(true)
    }
  })

  test('projection block atoms are exported function components', () => {
    for (const name of [
      'UserMessageBubble', 'UserTextRun', 'ReferenceChip', 'JsonTree', 'DiffBlock', 'ReadBlock',
      'SearchBlock', 'WebBlock', 'TerminalBlock', 'CommandText', 'FileTypeIcon', 'LinkIconMedium',
      'MarkdownText', 'CodeBlock', 'FenceCodeBlock', 'JsonBlock', 'HoverCard',
    ] as const) {
      expect(isElementType((P as Record<string, unknown>)[name]), name).toBe(true)
    }
  })

  test('menu family atoms (JsonTree closure) are exported', () => {
    for (const name of ['Menu', 'MenuItemButton', 'MenuSurface', 'MenuGroup', 'useDismissOnOutsidePointer'] as const) {
      expect(isElementType((P as Record<string, unknown>)[name]), name).toBe(true)
    }
  })

  test('theme face contract: ICON_SYMBOLS table + iconSymbolId shape', () => {
    expect(P.ICON_SYMBOLS instanceof Object).toBe(true)
    expect(Object.isFrozen(P.ICON_SYMBOLS)).toBe(true)
    expect(Object.keys(P.ICON_SYMBOLS).length).toBeGreaterThan(20)
    // dsh 契约：表值为完整 `<svg>` 标记串（ui-theme icon-sprite 的 toSymbol 以 DOMParser 解析后包 `<symbol>`）。
    expect(P.ICON_SYMBOLS['dsw-icon-search-outline-regular']).toStartWith('<svg ')
    expect(P.ICON_SYMBOLS['dsw-icon-search-outline-regular']).toContain('viewBox')
    expect(P.iconSymbolId('search-outline', 'regular')).toBe('dsw-icon-search-outline-regular')
  })

  test('connection + state atoms', () => {
    expect(typeof P.ConnectionIndicator).toBe('function')
    expect(typeof P.StateDot).toBe('function')
  })
})

describe('pure-function atoms', () => {
  test('relativeTime buckets', () => {
    const now = 1_800_000_000_000
    expect(relativeTimeOf(now - 30_000)).toEqual({ unit: 'now', n: 0 })
    expect(relativeTimeOf(now - 5 * 60_000)).toEqual({ unit: 'minutes', n: 5 })
    expect(relativeTimeOf(now - 3 * 3_600_000)).toEqual({ unit: 'hours', n: 3 })
    expect(relativeTimeOf(now - 2 * 86_400_000)).toEqual({ unit: 'days', n: 2 })
  })
  function relativeTimeOf(at: number) {
    return (P as { relativeTime(at: number, now: number): { unit: string; n: number } }).relativeTime(at, 1_800_000_000_000)
  }

  test('headTailCap arithmetic', () => {
    expect(headTailCap(10, 4, false)).toEqual({ hidden: 6, capped: true, headLines: 2, tailLines: 2 })
    expect(headTailCap(10, 4, true).capped).toBe(false)
    expect(headTailCap(3, 4, false).capped).toBe(false)
  })
  function headTailCap(total: number, maxLines: number, expanded: boolean) {
    return (P as { headTailCap(total: number, maxLines: number, expanded: boolean): { hidden: number; capped: boolean; headLines: number; tailLines: number } })
      .headTailCap(total, maxLines, expanded)
  }

  test('fileSizeText compact units', () => {
    expect((P as { fileSizeText(bytes: number): string }).fileSizeText(312)).toBe('312B')
    expect((P as { fileSizeText(bytes: number): string }).fileSizeText(4300)).toBe('4.2KB')
    expect((P as { fileSizeText(bytes: number): string }).fileSizeText(1024 * 1024)).toBe('1.0MB')
  })

  test('parseAnsiLines splits styled lines', async () => {
    // TerminalBlock 闭包内部件（dsh index 不导出，面 verbatim）：直测模块。
    const { parseAnsiLines } = await import('../src/ansi.ts')
    const lines = parseAnsiLines('\x1B[31mred\x1B[0m plain\nsecond')
    expect(lines.length).toBe(2)
    expect(JSON.stringify(lines[0])).toContain('red')
    expect(JSON.stringify(lines[1])).toContain('second')
  })
})

describe('markdown pipeline (DOM-free mdast + element legs)', () => {
  test('parseGfm GFM constructs', async () => {
    const { parseGfm } = await import('../src/markdown/parse.ts')
    const doc = parseGfm('# Hi\n\n~~gone~~\n\n| a | b |\n| - | - |\n| 1 | 2 |')
    expect(doc.children[0]?.type).toBe('heading')
    // delete 嵌在段落 children 内（GFM strikethrough）；table 为顶层块。
    const strikethrough = doc.children[1] as { children: Array<{ type: string }> }
    expect(strikethrough.children[0]?.type).toBe('delete')
    expect(doc.children.map(c => c.type)).toContain('table')
  })

  test('extractMarkdownPlainText projects text', async () => {
    const { extractMarkdownPlainText } = await import('../src/markdown/plain-text.ts')
    expect(extractMarkdownPlainText('# Title\n\nbody **bold**')).toContain('Title')
    expect(extractMarkdownPlainText('first para\n\nsecond')).toContain('first para')
  })
})
