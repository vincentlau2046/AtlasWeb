// Adapted from dsh@dsh-v0.2.2-rc.2 (T6-A Task 5): B 案（回审 2026-11-20）——FenceMathBlock/KaTeX 臂剔除；
// ```math fence 由 render.tsx 路由落 FenceCodeBlock（math fence→code fence 转换，判据腿 math-fence.test.ts）。
/** Fence presets: the code and math blocks a Markdown document renders for one fence. */
import type { ReactNode } from 'react'
import { CodeBlock } from './CodeBlock.tsx'
import type { MarkdownCodeLabels } from './render.tsx'

/** Inputs of {@link FenceCodeBlock}. */
export interface FenceCodeBlockProps {
  /** Grammar hint and banner text; omitted renders plain code. */
  lang?: string | undefined
  /** The fence body without its closing newline. */
  code: string
  /** The surrounding document is still streaming; the block keeps its instance as `code` grows. */
  streaming: boolean
  /** Localized code-block chrome. */
  labels: MarkdownCodeLabels
  /** Unified-diff rows; omitted follows `lang` as {@link CodeBlock} does. */
  diff?: boolean | undefined
}

/**
 * Render one fence body as a code block.
 * @param props - fence language, body, streaming state, chrome labels, and diff choice.
 * @returns the code block.
 */
export function FenceCodeBlock({ lang, code, streaming, labels, diff }: FenceCodeBlockProps): ReactNode {
  return (
    <CodeBlock
      // The replaced hast pipeline appended one synthetic newline that
      // CodeBlock's display trim removes; feeding the bare value would make
      // that trim eat a REAL trailing blank line inside the fence instead.
      code={`${code}\n`}
      lang={lang}
      streaming={streaming}
      diff={diff}
      copyLabel={labels.copyLabel}
      copiedLabel={labels.copiedLabel}
      toolbarLabels={labels.toolbarLabels}
    />
  )
}
