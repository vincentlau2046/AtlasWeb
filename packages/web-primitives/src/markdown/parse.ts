// Adapted from dsh@dsh-v0.2.2-rc.2 (T6-A Task 5): B 案（回审 2026-11-20）——
// settled 臂去除 math 扩展（micromark-extension-math / mdast-util-math /
// mathCompatibility 剔除，dep 行升格面 21→16）；两臂语法同形为 GFM，
// `$$…$$` 显示数学按段落文本保留（登记债：数学渲染候后续波回补）。
/**
 * The markdown renderer's two mdast grammars, one per rendering arm. Each
 * arm is internally consistent — the incremental tail parses, the one-shot
 * parses, and the plain-text projection of a given grammar always agree on
 * where blocks start and end — and the settled grammar is the streaming one
 * plus the math extensions, so the arms differ only where TeX delimiters
 * begin a math construct (a `$$` block is a paragraph while streaming and a
 * math block once settled, by design).
 */

import type { Root } from 'mdast'
import { recoverLocalImages } from './local-image-syntax.ts'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { gfm } from 'micromark-extension-gfm'
import { cjkFriendlyStrong } from './cjkFriendlyStrong.ts'
import { windowsPathDestinations } from './windows-path-destinations.ts'

/** GFM strikethrough requires `~~`; a single `~` stays literal, as in ranges such as `10~20`. */
const gfmOptions = { singleTilde: false }

/**
 * Parse GFM markdown (the streaming arm's grammar: no math, so incomplete
 * TeX never flashes KaTeX errors mid-stream).
 * @param text - Markdown source.
 * @returns The mdast root.
 */
export function parseGfm(text: string): Root {
  return recoverLocalImages(fromMarkdown(text, {
    extensions: [gfm(gfmOptions), cjkFriendlyStrong()],
    mdastExtensions: [gfmFromMarkdown(), windowsPathDestinations()],
  }), text)
}

/**
 * Parse GFM markdown plus TeX math with the compatibility delimiters
 * (the settled arm's grammar).
 *
 * B 案：math 扩展已剔除，settled 臂与 streaming 臂同语法——`$$…$$` 保持
 * 段落文本（内容保留不丢弃），```math fence 经 FenceBlocks 路由为 code fence。
 * @param text - Markdown source.
 * @returns The mdast root.
 */
export function parseGfmWithMath(text: string): Root {
  return recoverLocalImages(fromMarkdown(text, {
    extensions: [gfm(gfmOptions), cjkFriendlyStrong()],
    mdastExtensions: [gfmFromMarkdown(), windowsPathDestinations()],
  }), text)
}
