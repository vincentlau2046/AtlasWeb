/**
 * AtlasWeb 第一波候选 Playwright runner 配置（A0）。
 *
 * - testMatch 仅双星 glob 的 .pw.ts：与 bun test 的默认发现（*.test.ts）正交，
 *   全仓 `bun test` 不会误捞浏览器腿；Playwright 由显式 config 执行。
 * - workers=1：fixture 目录与安装目录按测试序串行，零跨腿污染。
 * - globalSetup：ATLASWEB_TGZ 预检（缺失/错 scope → 非零退出，fail-closed）。
 * - 令牌与宿主目录不进报告：打开链接只在 runner 内存构造，报告只含
 *   制品锚（artifactSha256）与用例结论。
 */
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: '*.pw.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  globalSetup: './globalSetup.ts',
  reporter: [['list']],
})
