// T6-A Task 4: web-theme 入口——主题设置契约（verbatim）+ boot 注入行（webserver
// 边局部化）。client 面（ThemeRuntime/样式/精灵）经 `./client` 出口；
// 偏好传输 = @atlasweb/web-brand 槽位（ThemeSettingsHost）。
export {
  DEFAULT_FONT_SIZE, DEFAULT_PREFERENCE, FONT_FAMILY_FIELDS, FONT_SIZE_FIELD,
  FONT_SIZE_MAX, FONT_SIZE_MIN, FONT_ROLES, FONT_SIZE_SPECS,
  THEME_PREFERENCE_FIELD, THEME_PREFERENCES, THEME_SETTINGS_NAMESPACE,
  fontFamilyVariable, fontSizeSchema, isFontSize, isThemePreference,
  normalizeFontFamily, sectionFontSizes,
  type FontFamilies, type FontRole, type FontSizes, type FontSizeSpec,
  type ThemePreference, type ThemeSettings,
} from './theme-settings.ts'
export { bootThemeInjections } from './boot-theme.ts'
export type { IndexInjection } from './index-injection.ts'
