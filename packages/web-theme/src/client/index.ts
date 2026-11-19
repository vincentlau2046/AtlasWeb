// Adapted from dsh@dsh-v0.2.2-rc.2 (T6-A Task 4): 裁剪版 client 面——dsh 原形为
// client plugin apply()（locale 字典注册 + Appearance/Font settings 行 slots 注册 +
// shortcuts 字号键），全部属产品服务边（禁入 R5）已剥离；AtlasWeb 组装归 Task 7
// shell boot kernel（installThemeStyles + ThemeRuntime + installIconSprite 消费面）。
// 导出面 = 主题运行时 + 类型 + 样式/精灵安装器。
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { installIconSprite } from './icon-sprite.ts'
import { installThemeStyles } from './styles.ts'
import { ThemeRuntime } from './theme-runtime.ts'
import type { ThemeSettings } from '../theme-settings.ts'
import type { ThemeSettingsHost } from '@atlasweb/web-brand'

export { ThemeRuntime } from './theme-runtime.ts'
export type {
  IconReplacements, ThemeDefinition, ThemeSnapshot, ThemeTokenInspection,
  ThemeTokenModes, ThemeTokenOverrides, ThemeTokens,
} from './theme-runtime.ts'
export type { FontFamilies, FontRole, FontSizes } from '../theme-settings.ts'
export { installIconSprite } from './icon-sprite.ts'
export { installThemeStyles } from './styles.ts'

/**
 * Provide the theme runtime over a brand-slot settings host and mount the
 * icon sprite for its active theme. Styles install separately via
 * {@link installThemeStyles} (the shell boot owns ordering). dsh 的 plugin
 * apply 形在此收窄为工厂：settings 行/locale/shortcuts 边不移植（R5）。
 * @param ctx - client cordis context.
 * @param host - durable theme settings transport (brand slot; Task 8 implementation).
 * @returns the provided runtime (also reachable as ctx.theme).
 */
export function provideThemeRuntime(ctx: ClientContext, host: ThemeSettingsHost<ThemeSettings>): ThemeRuntime {
  const theme = new ThemeRuntime(ctx, host)
  ctx.provide('theme', theme)
  installIconSprite(ctx, theme.getTheme().active.icons)
  return theme
}
