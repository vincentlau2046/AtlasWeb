// Adapted from dsh@dsh-v0.2.2-rc.2 (T6-A Task 5): 裁剪版入口——仅重导出冻结清单原子
// （docs/t6a-primitives-freeze-list.md §2；S5 seed shim 同面）。清单外原子 = Task 8 停腿（审计 §C 必改②b）。
/**
 * Cordis-free React primitives styled only through `--dsw-*` tokens.
 */

// chrome controls
export { Button } from './Button.tsx'
export type { ButtonVariant } from './Button.tsx'
export { StateDot } from './StateDot.tsx'
export type { StateDotState } from './StateDot.tsx'
export { Pill } from './Pill.tsx'
export { PathLabel } from './PathLabel.tsx'
export { Tag } from './Tag.tsx'
export type { TagTone } from './Tag.tsx'
export { Toast } from './Toast.tsx'
export { Input } from './Input.tsx'
export { Tooltip } from './Tooltip.tsx'
export type { TooltipSide } from './Tooltip.tsx'
export { TextShimmer } from './TextShimmer.tsx'
export type { TextShimmerProps } from './TextShimmer.tsx'
export { ConnectionIndicator } from './ConnectionIndicator.tsx'
export type { ConnectionIndicatorState } from './ConnectionIndicator.tsx'
export { DisclosureRow } from './DisclosureRow.tsx'
export type { DisclosureRowProps } from './DisclosureRow.tsx'
export { FoldToggle } from './FoldToggle.tsx'
export { CodeToolbar } from './CodeToolbar.tsx'
export type { CodeToolbarLabels } from './CodeToolbar.tsx'
export { relativeTime } from './relative-time.ts'
export type { RelativeTime, RelativeTimeUnit } from './relative-time.ts'

// icons module (trimmed wrappers; artwork data whole for the theme sprite contract)
export type { IconProps } from './icons/props.ts'
export {
  ICON_MEDIUM_STROKE, ICON_REGULAR_STROKE, ICON_SYMBOLS, iconSymbolId,
  type IconGlyph, type IconSymbolId, type IconWeight,
} from './icons/artwork.ts'
export * from './icons/index.tsx'

// projection blocks
export { UserMessageBubble } from './UserMessageBubble.tsx'
export type { UserMessageBubbleProps } from './UserMessageBubble.tsx'
export { UserTextRun, ReferenceChip } from './user-text.tsx'
export type { UserTextRunProps, ReferenceChipProps } from './user-text.tsx'
export { ReferenceIconMedium, ReferenceIconRegular } from './ReferenceIcon.tsx'
export type { ReferenceIconKind, ReferenceIconProps } from './ReferenceIcon.tsx'
export { JsonTree } from './JsonTree.tsx'
export type { JsonTreeProps, JsonTreeLabels } from './JsonTree.tsx'
export { DiffBlock, diffTotals, DEFAULT_DIFF_MAX_LINES } from './DiffBlock.tsx'
export type { DiffBlockProps, DiffHunk, DiffBlockLabels } from './DiffBlock.tsx'
export { ReadBlock, DEFAULT_READ_MAX_LINES } from './ReadBlock.tsx'
export type { ReadBlockProps, ReadBlockLine, ReadBlockLabels } from './ReadBlock.tsx'
export { SearchBlock, DEFAULT_SEARCH_MAX_LINES } from './SearchBlock.tsx'
export type {
  SearchBlockProps, SearchMatchesBlockProps, SearchPathsBlockProps, SearchFileGroup, SearchBlockLineMatch,
  SearchBlockLabels,
} from './SearchBlock.tsx'
export { WebBlock } from './WebBlock.tsx'
export type {
  WebBlockProps, WebSearchBlockProps, WebFetchBlockProps, WebSourceView, WebBlockLabels,
} from './WebBlock.tsx'
export { TerminalBlock, DEFAULT_TERMINAL_MAX_LINES } from './TerminalBlock.tsx'
export type { TerminalBlockProps, TerminalBlockLabels } from './TerminalBlock.tsx'
export { CommandText } from './CommandText.tsx'
export type { CommandTextProps } from './CommandText.tsx'
export { FileTypeIcon, classifyFileType, fileExtension } from './FileTypeIcon.tsx'
export type {
  CodeFileType, FileType, FileTypeIconProps, FileTypeKind, FileTypeProjectContext,
} from './FileTypeIcon.tsx'
export { LinkIconMedium, LinkIconRegular, classifyLinkPath } from './LinkIcon.tsx'
export type { LinkIconKind, LinkIconProps } from './LinkIcon.tsx'

// markdown pipeline
export { MarkdownText } from './markdown/MarkdownText.tsx'
export type { MarkdownCodeLabels, MarkdownFileMentions, MarkdownLabels, MarkdownPathImages } from './markdown/MarkdownText.tsx'
export { CodeBlock } from './markdown/CodeBlock.tsx'
export type { CodeBlockProps } from './markdown/CodeBlock.tsx'
export { FenceCodeBlock } from './markdown/FenceBlocks.tsx'
export type { FenceCodeBlockProps } from './markdown/FenceBlocks.tsx'
export { JsonBlock } from './markdown/JsonBlock.tsx'
export { MarkdownDelegateProvider, useMarkdownDelegate } from './markdown/MarkdownDelegate.tsx'
export type {
  MarkdownDelegate, MarkdownDelegateProviderProps, MarkdownExternalLinkHandler, MarkdownDelegateFenceInfo,
} from './markdown/MarkdownDelegate.tsx'
export { extractMarkdownPlainText } from './markdown/plain-text.ts'
export type { MarkdownPlainTextMode, MarkdownPlainTextOptions } from './markdown/plain-text.ts'

// code highlighting (edge-localized table + plain stub highlighter)
export { CODE_HIGHLIGHT_EXTENSIONS, languageForPath, useCodeHighlighter } from './code-highlighting.ts'
export type { CodeHighlighter, HighlightSpan } from './code-highlighting.ts'

// menu family (JsonTree closure)
export { Menu, MenuItemButton } from './Menu.tsx'
export { MenuSurface, MENU_TRANSITION_MS } from './MenuSurface.tsx'
export type { MenuSurfaceProps } from './MenuSurface.tsx'
export { MenuGroup, observeStickyMenuGroups } from './MenuGroup.tsx'
export type { MenuItemButtonProps, MenuEntry, MenuItem, MenuSeparator, MenuLabel } from './Menu.tsx'
export { useAnchoredMaxHeight } from './useAnchoredMaxHeight.ts'
export { useDismissOnOutsidePointer } from './useDismissOnOutsidePointer.ts'

// hover + support
export { HoverCard } from './HoverCard.tsx'
export { HoverCardGroup } from './HoverCardGroup.tsx'
export { usePointerGrace } from './pointer-grace.ts'
export { headTailCap } from './head-tail-cap.ts'
export type { HeadTailCap } from './head-tail-cap.ts'
export { fileSizeText } from './file-size.ts'
export { writeClipboard } from './clipboard.ts'
export { useClipboardCopy } from './use-clipboard-copy.ts'
export type { ClipboardCopyState } from './use-clipboard-copy.ts'

// image family (MarkdownText verbatim closure)
export { ImagePreview } from './ImagePreview.tsx'
export { ImageLightbox } from './ImageLightbox.tsx'
export type { ImageLightboxLabels } from './ImageLightbox.tsx'
export { DraggableImage } from './DraggableImage.tsx'
export type { DraggableImageProps } from './DraggableImage.tsx'
