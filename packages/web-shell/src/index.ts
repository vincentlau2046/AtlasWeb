// T6-A Task 7: web-shell 公共面——boot kernel 消费入口（apps 层 Task 9）。
// 内部件（seed/platform/boot-client/mount/apply-injections/boot-page）由
// AppWebEntry 组装；此处导出浏览器入口与平台词表。
export { AppWebEntry } from './boot.ts'
export type { BootSeams } from './boot.ts'
export { bootClient, assertEntriesActive } from './boot-client.ts'
export type { ClientBootOptions, EntryStateLabel } from './boot-client.ts'
export { mountClient } from './mount.ts'
export { PLATFORM_MODULES, PRELOADED_CLIENT_EXTERNALS } from './platform.ts'
export type { PlatformModule } from './platform.ts'
export { getStaticModules } from './seed.ts'
export { applyIndexInjections } from './apply-injections.ts'
export { STATE_LABELS, FIBER_STATE } from './loader-status.ts'
export type { LoaderEntryState } from './loader-status.ts'
export { BootPage } from './boot-page.ts'
