// Adapted from dsh@dsh-v0.2.2-rc.2 (T6-A Task 5): 图标导出裁剪——仅保留移植源消费 + Task 8 预注册 glyph
// （Regular 权重；ICON_ARTWORK/ICON_SYMBOLS 数据面全量保留=主题 sprite 契约；Medium/wrapper 需要走 Task 8 停腿补一行）。
/**
 * Shared current-color product icons. Names identify the glyph and weight;
 * rendered size remains a prop instead of part of the component name. Each
 * icon references its `dsw-icon-<glyph>-<weight>` symbol in the document icon
 * sprite that ui-theme maintains, so a theme can replace the artwork without
 * touching callers and the artwork inherits `currentColor` and CSS variables.
 */
import { ICON_ARTWORK, iconSymbolId, type IconGlyph, type IconWeight } from './artwork.ts'
import type { IconProps } from './props.ts'

export type { IconProps } from './props.ts'
export { ICON_MEDIUM_STROKE, ICON_REGULAR_STROKE, ICON_SYMBOLS, type IconSymbolId } from './artwork.ts'

/** Shared shield contour used by composite icons outside this module. */

function productIcon(glyph: IconGlyph, weight: IconWeight): (props: IconProps) => React.JSX.Element {
  const { size: defaultSize, aspect: [width, height] = [1, 1] }: { size: number; aspect?: readonly [number, number] } = ICON_ARTWORK[glyph]
  const id = iconSymbolId(glyph, weight)
  return ({ size = defaultSize, className }: IconProps) => (
    <svg width={(size * width) / height} height={size} className={className} data-icon={id} aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  )
}

/** Regular one-pixel IconLayersOutline artwork. */

/** Medium IconLayersOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconNewChatOutline artwork. */

/** Medium IconNewChatOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconSearchOutline artwork. */
export const IconSearchOutlineRegular = productIcon('search-outline', 'regular')

/** Medium IconSearchOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconEyeOutline artwork. */

/** Medium IconEyeOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconEyeOffOutline artwork. */

/** Medium IconEyeOffOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconGlobeOutline artwork. */
export const IconGlobeOutlineRegular = productIcon('globe-outline', 'regular')

/** Medium IconGlobeOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconSettingsOutline artwork. */

/** Medium IconSettingsOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconPanelLeftOutline artwork. */

/** Medium IconPanelLeftOutline artwork with a 1.3px stroke. */

/** Regular IconEllipsisOutline artwork; its fill-only geometry is weight-independent. */
export const IconEllipsisOutlineRegular = productIcon('ellipsis-outline', 'regular')

/** Medium IconEllipsisOutline artwork; it matches Regular because the geometry is fill-only. */

/** Regular one-pixel IconPlusOutline artwork. */

/** Medium IconPlusOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconCheckOutline artwork. */
export const IconCheckOutlineRegular = productIcon('check-outline', 'regular')

/** Medium IconCheckOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconBranchOutline artwork. */

/** Medium IconBranchOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconChevronDownOutline artwork. */
export const IconChevronDownOutlineRegular = productIcon('chevron-down-outline', 'regular')

/** Medium IconChevronDownOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconChevronLeftOutline artwork. */
export const IconChevronLeftOutlineRegular = productIcon('chevron-left-outline', 'regular')

/** Medium IconChevronLeftOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconChevronRightOutline artwork. */
export const IconChevronRightOutlineRegular = productIcon('chevron-right-outline', 'regular')

/** Medium IconChevronRightOutline artwork with a 1.3px stroke. */

/** Regular IconTriangleRightFill artwork; its fill-only geometry is weight-independent. */

/** Medium IconTriangleRightFill artwork; it matches Regular because the geometry is fill-only. */

/** Regular one-pixel IconChevronUpOutline artwork. */
export const IconChevronUpOutlineRegular = productIcon('chevron-up-outline', 'regular')

/** Medium IconChevronUpOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconCloseOutline artwork. */
export const IconCloseOutlineRegular = productIcon('close-outline', 'regular')

/** Medium IconCloseOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconCloseFill artwork. */

/** Medium IconCloseFill artwork with a 1.3px stroke. */

/** Regular IconCloseCircleFill artwork (cross knocked out of a filled disc); its fill-only geometry is weight-independent. */

/** Medium IconCloseCircleFill artwork; it matches Regular because the geometry is fill-only. */

/** Regular one-pixel IconCopyOutline artwork. */
export const IconCopyOutlineRegular = productIcon('copy-outline', 'regular')

/** Medium IconCopyOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconRefreshOutline artwork. */
export const IconRefreshOutlineRegular = productIcon('refresh-outline', 'regular')

/** Medium IconRefreshOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconLikeOutline artwork. */

/** Medium IconLikeOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconLikeFill artwork. */

/** Medium IconLikeFill artwork with a 1.3px stroke. */

/** Regular one-pixel IconDislikeOutline artwork. */

/** Medium IconDislikeOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconDislikeFill artwork. */

/** Medium IconDislikeFill artwork with a 1.3px stroke. */

/** Regular one-pixel IconShareOutline artwork. */

/** Medium IconShareOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconDeliverDoc artwork. */

/** Medium IconDeliverDoc artwork with a 1.3px stroke. */

/** Regular one-pixel IconEditOutline artwork. */
export const IconEditOutlineRegular = productIcon('edit-outline', 'regular')

/** Medium IconEditOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconThinkOutline artwork. */
export const IconThinkOutlineRegular = productIcon('think-outline', 'regular')

/** Medium IconThinkOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconAgentPresetOutline artwork. */

/** Medium IconAgentPresetOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconBrowseOutline artwork. */
export const IconBrowseOutlineRegular = productIcon('browse-outline', 'regular')

/** Medium IconBrowseOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconContextInjectionOutline artwork. */
export const IconContextInjectionOutlineRegular = productIcon('context-injection-outline', 'regular')

/** Medium IconContextInjectionOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconLinkOutline artwork. */

/** Medium IconLinkOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconRightUpOutline artwork. */

/** Medium IconRightUpOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconEnhanceOutline artwork. */

/** Medium IconEnhanceOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconTrashOutline artwork. */

/** Medium IconTrashOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconWarningOutline artwork. */
export const IconWarningOutlineRegular = productIcon('warning-outline', 'regular')

/** Medium IconWarningOutline artwork with a 1.3px stroke. */

/** Regular IconCheckCircleFill artwork (circled check); its fill-only geometry is weight-independent. */

/** Medium IconCheckCircleFill artwork; it matches Regular because the geometry is fill-only. */

/** Regular rounded warning triangle with an exclamation mark. */

/** Medium rounded warning triangle with an exclamation mark. */

/** Regular one-pixel IconUserOutline artwork. */

/** Medium IconUserOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconUsersOutline artwork: a front person with a second person behind. */

/** Medium IconUsersOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconPaperPlaneOutline artwork. */

/** Medium IconPaperPlaneOutline artwork with a 1.3px stroke. */

/** Regular IconStopFill artwork; its fill-only geometry is weight-independent. */

/** Medium IconStopFill artwork; it matches Regular because the geometry is fill-only. */

/** Regular one-pixel IconPaperclipOutline artwork. */

/** Medium IconPaperclipOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconLoadingOutline artwork. */
export const IconLoadingOutlineRegular = productIcon('loading-outline', 'regular')

/** Medium IconLoadingOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconDownloadOutline artwork. */

/** Medium IconDownloadOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconPlayOutline artwork. */

/** Medium IconPlayOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconPauseOutline artwork. */

/** Medium IconPauseOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconFullscreenOutline artwork. */

/** Medium IconFullscreenOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconCodeOutline artwork. */

/** Medium IconCodeOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconCordisPluginOutline artwork. */

/** Medium IconCordisPluginOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconApiOutline artwork. */
export const IconApiOutlineRegular = productIcon('api-outline', 'regular')

/** Medium IconApiOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconPersonalizationOutline artwork. */

/** Medium IconPersonalizationOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconProjectAddOutline artwork. */

/** Medium IconProjectAddOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconFolderOpenOutline artwork. */

/** Medium IconFolderOpenOutline artwork with a 1.3px stroke. */

/** Regular IconFolderOpen artwork; its fill-only geometry is weight-independent. */

/** Medium IconFolderOpen artwork; it matches Regular because the geometry is fill-only. */

/** Regular one-pixel IconFolderClose artwork. */

/** Medium IconFolderClose artwork with a 1.3px stroke. */

/** Regular one-pixel IconTreeCorner artwork. */

/** Medium IconTreeCorner artwork with a 1.3px stroke. */

/** Regular one-pixel IconLightOutline artwork. */

/** Medium IconLightOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconDarkOutline artwork. */

/** Medium IconDarkOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconFollowsystemOutline artwork. */

/** Medium IconFollowsystemOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconDataOutline artwork. */

/** Medium IconDataOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconDatabaseOutline artwork. */
export const IconDatabaseOutlineRegular = productIcon('database-outline', 'regular')

/** Medium IconDatabaseOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconClockOutline artwork. */
export const IconClockOutlineRegular = productIcon('clock-outline', 'regular')

/** Medium IconClockOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconGaugeOutline artwork. */
export const IconGaugeOutlineRegular = productIcon('gauge-outline', 'regular')

/** Medium IconGaugeOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconSendOutline artwork. */

/** Medium IconSendOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconQueueOutline artwork. */

/** Medium IconQueueOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconChecklistOutline artwork. */
export const IconChecklistOutlineRegular = productIcon('checklist-outline', 'regular')

/** Medium IconChecklistOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconListPenOutline artwork. */

/** Medium IconListPenOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconGoalOutline artwork. */

/** Medium IconGoalOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconSparkle artwork. */

/** Medium IconSparkle artwork with a 1.3px stroke. */

/** Regular one-pixel IconInspectOutline artwork. */
export const IconInspectOutlineRegular = productIcon('inspect-outline', 'regular')

/** Medium IconInspectOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconSkillOutline artwork. */

/** Medium IconSkillOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconQuestionOutline artwork. */
export const IconQuestionOutlineRegular = productIcon('question-outline', 'regular')

/** Medium IconQuestionOutline artwork with a 1.3px stroke. */

/** Regular IconInfoOutline artwork; its fill-only geometry is weight-independent. */

/** Medium IconInfoOutline artwork; its fill-only geometry is weight-independent. */

/** Regular one-pixel plugin pinwheel artwork. */

/** Medium plugin pinwheel artwork with a 1.3px stroke. */

/** Regular one-pixel IconAlarmClockOutline artwork. */

/** Medium IconAlarmClockOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconArchiveOutline artwork. */

/** Medium IconArchiveOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconWrapLinesOutline artwork. */
export const IconWrapLinesOutlineRegular = productIcon('wrap-lines-outline', 'regular')

/** Medium IconWrapLinesOutline artwork with a 1.3px stroke. */

/** Regular IconNowrapFill artwork; fill-only weights render identically. */
export const IconNowrapFillRegular = productIcon('nowrap-fill', 'regular')

/** Medium IconNowrapFill artwork; fill-only weights render identically. */

/** Regular IconWrapFill artwork; fill-only weights render identically. */
export const IconWrapFillRegular = productIcon('wrap-fill', 'regular')

/** Medium IconWrapFill artwork; fill-only weights render identically. */

/** Regular one-pixel IconCompareSplitOutline artwork. */

/** Medium IconCompareSplitOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconPlanOutline artwork. */

/** Medium IconPlanOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconCompactOutline artwork. */

/** Medium IconCompactOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconShieldOutline artwork. */

/** Medium IconShieldOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconCheckCircleOutline artwork. */
export const IconCheckCircleOutlineRegular = productIcon('check-circle-outline', 'regular')

/** Medium IconCheckCircleOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconUnarchiveOutline artwork. */

/** Medium IconUnarchiveOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconPinOutline artwork. */

/** Medium IconPinOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconPinFill artwork. */

/** Medium IconPinFill artwork with a 1.3px stroke. */

/** Regular one-pixel IconFlatListOutline artwork. */

/** Medium IconFlatListOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconWorkspaceTreeOutline artwork. */

/** Medium IconWorkspaceTreeOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconChevronsUpDownOutline artwork. */

/** Medium IconChevronsUpDownOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconDragHandleOutline artwork. */

/** Medium IconDragHandleOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconArchiveOffOutline artwork. */

/** Medium IconArchiveOffOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconArchiveCheckOutline artwork. */

/** Medium IconArchiveCheckOutline artwork with a 1.3px stroke. */

/** Regular one-pixel IconSlidersTwoOutline artwork. */

/** Medium IconSlidersTwoOutline artwork with a 1.3px stroke. */

/** Microphone with uniform one-pixel strokes. */

/** Microphone with uniform 1.3px strokes. */

/** `compact` moves the tiles 0.5px inward, for glyphs drawn at card size. */
type AppsAddIconProps = IconProps & { readonly compact?: boolean | undefined }

function appsAddIcon(weight: IconWeight): (props: AppsAddIconProps) => React.JSX.Element {
  const Wide = productIcon('apps-add-outline', weight)
  const Compact = productIcon('apps-add-compact-outline', weight)
  return ({ compact = false, ...props }: AppsAddIconProps) => (compact ? <Compact {...props} /> : <Wide {...props} />)
}

/** Three entry tiles and an add mark with one-pixel strokes. */
export const IconAppsAddOutlineRegular = appsAddIcon('regular')

/** Three entry tiles and an add mark with 1.3px strokes. */
export const IconAppsAddOutlineMedium = appsAddIcon('medium')

/** Regular floppy-disk save action. */

/** Medium floppy-disk save action. */
