// Adapted from dsh@dsh-v0.2.2-rc.2 packages/client/web/src/platform.ts (MIT).
// Adaptation: Atlas platform words — dsh product packages (store/ui-slots/
// ui-primitives/ui-dockkit) re-pointed to @atlasweb/* seams; ui-dockkit row
// replaced by @atlasweb/web-layout (minimal layout host); zod and
// @tanstack/react-virtual dropped (zero consumers in AtlasWeb — schemastery
// replaced zod, no virtualized view before the Task 8 stop-leg re-adds it).
// MIT license; original dsh header below.
/**
 * Shared browser platform modules. Seeding, bundling externals, and Vite
 * aliases consume this list so their module identities cannot drift.
 * @module @atlasweb/web-shell/src/platform
 */

/** The module specifiers the shell shares into the frozen module table. */
export const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@atlasweb/web-store',
  '@atlasweb/web-slots',
  '@atlasweb/web-primitives',
  '@atlasweb/web-layout',
] as const

/** Client-bundle specifiers whose factories the parser preloads before the shell starts. */
export const PRELOADED_CLIENT_EXTERNALS = [
] as const

/** One platform module specifier (a seed-table key). */
export type PlatformModule = (typeof PLATFORM_MODULES)[number]
