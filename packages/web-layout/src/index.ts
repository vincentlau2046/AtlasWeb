// T6-A Task 7: web-layout 包入口 = loader entry 模块面（最小布局宿主）。
// dsh 中 ui-layout 为 entry 模块、ui-dockkit 为平台模块两件分离；Atlas 收敛为
// 一包：本入口即 client 插件形（apply + inject），平台表与必需入口表共用
// '@atlasweb/web-layout' 一个词（seed/platform/boot-client 三点裁定）。
// 子槽声明/组件/store 为包内部件，经 client/ 直引；公共契约在此重导出。
export { apply, inject } from './client/index.ts'
export { LayoutController } from './client/index.ts'
export type { ILayout, MainPanelId, PanelInfo, UsePanelInfo } from './client/index.ts'
export type { SidebarOwnerProps, RightbarOwnerProps } from './client/index.ts'
export type { SessionTitleEntry, SessionTitleState, UseSessionsTitle } from './client/index.ts'
export { createLayoutStore } from './client/stores.ts'
export { clampWidth, computeColumns } from './client/columns.ts'
