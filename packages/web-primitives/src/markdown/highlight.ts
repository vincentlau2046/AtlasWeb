// Adapted from dsh@dsh-v0.2.2-rc.2 (T6-A Task 5): B 案（回审 2026-11-20）——
// shiki 高亮器整体置 plain 桩（dep 行 shiki/@shikijs/langs 剔除）；消费面
// （code-highlighting.ts / CodeBlock.tsx）保持原形，所有高亮入口返回 undefined
// 走 dsh 既有 plain 回退路径（useCodeHighlighter 契约：unknown/loading → plain）。
// 登记债：语法高亮候后续波回补（回审绑定条件①）。

/** One styled token span within a line. */
export interface HighlightSpan {
  text: string
  style?: import('react').CSSProperties | undefined
}

/** One streaming frame: immutable completed lines plus the growing tail. */
export interface StreamingHighlightFrame {
  generation: number
  appended: readonly HighlightSpan[][]
  tail: readonly HighlightSpan[][]
}

/**
 * Lazy-grammar load subscription. The plain stub never loads grammars, so the
 * listener set stays empty and never fires; the returned unsubscribe is inert.
 */
export function subscribeGrammarLoaded(_listener: () => void): () => void {
  return () => {}
}

/** Monotonic grammar-load counter; the plain stub is permanently zero. */
export function grammarLoadCount(): number {
  return 0
}

/**
 * Whether a language has a registered grammar. The plain stub registers none,
 * so CodeToolbar renders the generic code label for every language.
 */
export function supportsHighlighting(_lang: string | undefined): boolean {
  return false
}

/**
 * Highlight one source fragment into one token list per line.
 * The plain stub always returns `undefined` — callers fall back to plain text
 * (the dsh contract for unknown and loading grammars).
 */
export function highlightLines(_code: string, _lang: string | undefined): HighlightSpan[][] | undefined {
  return undefined
}

/**
 * Settled-arm HTML highlight. The plain stub always returns `undefined` —
 * CodeBlock renders its plain `pre` arm.
 */
export function highlightToHtml(_code: string, _lang: string | undefined): string | undefined {
  return undefined
}

/**
 * Incremental streaming highlight session. The plain stub yields no frames, so
 * streaming fences render plain text (CodeBlock's `frame === undefined` path).
 */
export class StreamingHighlightSession {
  updateFrame(_code: string, _lang: string | undefined): StreamingHighlightFrame | undefined {
    return undefined
  }
}
