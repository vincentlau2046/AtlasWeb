// T6-A Task 5: B 案改形判据腿（回审绑定条件②——数学 fence→code fence 转换有判据，
// 数学内容不得被静默丢弃或错渲染）+ highlight 桩契约腿（回审裁定 4 适配形锁定）。
import { describe, expect, test } from 'bun:test'

describe('binding condition ii: math fence → code fence conversion', () => {
  test('```math fence parses as a code node with body intact', async () => {
    const { parseGfmWithMath } = await import('../src/markdown/parse.ts')
    const root = parseGfmWithMath('```math\nE=mc^2\n```')
    const code = root.children.find(c => c.type === 'code') as { lang?: string; value?: string } | undefined
    expect(code).toBeDefined()
    expect(code?.lang).toBe('math')
    expect(code?.value).toBe('E=mc^2')
  })

  test('$$ display math survives as paragraph text (no silent drop)', async () => {
    const { parseGfmWithMath } = await import('../src/markdown/parse.ts')
    const root = parseGfmWithMath('before\n\n$$E=mc^2$$\n\nafter')
    const text = JSON.stringify(root.children)
    expect(text).toContain('E=mc^2')
    expect(root.children.some(c => c.type === 'math' || c.type === 'inlineMath')).toBe(false)
  })

  test('FenceCodeBlock routes math fences to CodeBlock with content verbatim', async () => {
    const { FenceCodeBlock } = await import('../src/markdown/FenceBlocks.tsx')
    const { CodeBlock } = await import('../src/markdown/CodeBlock.tsx')
    const element = (FenceCodeBlock as (props: Record<string, unknown>) => { type: unknown; props: Record<string, unknown> })({
      lang: 'math', code: 'E=mc^2', streaming: false, labels: { copyLabel: 'Copy', copiedLabel: 'Copied' },
    })
    expect(element.type).toBe(CodeBlock)
    expect(element.props.lang).toBe('math')
    expect(element.props.code).toBe('E=mc^2\n')
  })

  test('math arm is removed: FenceMathBlock no longer exists', async () => {
    const Fence = await import('../src/markdown/FenceBlocks.tsx')
    expect((Fence as Record<string, unknown>).FenceMathBlock).toBeUndefined()
  })
})

describe('ruling 4 adaptation lock: highlight plain stub', () => {
  test('highlight surface returns plain-fallback semantics', async () => {
    const stub = await import('../src/markdown/highlight.ts')
    expect(stub.highlightLines('const x = 1', 'typescript')).toBeUndefined()
    expect(stub.highlightToHtml('const x = 1', 'typescript')).toBeUndefined()
    expect(stub.grammarLoadCount()).toBe(0)
    const unsubscribe = stub.subscribeGrammarLoaded(() => {})
    expect(typeof unsubscribe).toBe('function')
    expect(new stub.StreamingHighlightSession().updateFrame('x', 'ts')).toBeUndefined()
  })

  test('CodeBlock plain path renders body verbatim (server string render, no DOM)', async () => {
    // 组件体走 hooks（useMemo/useSyncExternalStore 带 server snapshot），裸函数调用无
    // dispatcher；react-dom/server 纯字符串渲染（react-dom 为已批准 dep 行）即 DOM-free 渲染腿。
    const React = (await import('react')).default
    const { renderToStaticMarkup } = await import('react-dom/server')
    const { CodeBlock } = await import('../src/markdown/CodeBlock.tsx')
    const html = renderToStaticMarkup(
      React.createElement(CodeBlock, { code: 'const x = 1\n', lang: 'math', copyLabel: 'Copy', copiedLabel: 'Copied' }),
    )
    // plain 回退臂：body 逐字进 <code>，无 token span（桩恒 plain）。
    expect(html).toContain('<pre')
    expect(html).toContain('<code')
    expect(html).toContain('const x = 1')
    expect(html).not.toContain('token')
  })
})
