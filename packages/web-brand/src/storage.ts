// T6-A Task 8: durable 传输的 storage 缝形（浏览器 boot 传 localStorage；
// 缺省内存态——host.ts 内置 fallback）。
export interface ThemeSettingsStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}
