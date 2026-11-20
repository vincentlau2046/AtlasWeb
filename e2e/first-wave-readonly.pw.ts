/**
 * 第一波只读候选验收（A0：0.1.3 三个诚实反例，全部标 `[对照]`）。
 *
 * 反例来源 = docs/2026-11-20-first-wave-product-reaudit.md 表格行 1/3/4：
 * 1. 安装包无 bin 入口（清单无 bin、files 仅 dist+README）。
 * 2. 长会话尾部不可达（固定估高切片：多次触底仍只挂载中段，m360 缺席）。
 * 3. 刷新后选择丢失（selected 空、显示 "No session open."）。
 *
 * 反例 2/3 经受控复现程序跑：源码宿主 launchCli.ts 服已安装包 dist/。
 * 候选腿（A1–A4 落码后新增的正断言）禁止走源码宿主回退。
 *
 * 报告卫生：打开链接只在 runner 内存构造；本文件不输出令牌或宿主绝对路径。
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { cleanupInstalled, createSessionRoot, installTgz, launchSourceHostReproduction, mkdtempSafe, type InstalledApp, type SourceHostHandle } from './fixtures/installedApp'

let installed: InstalledApp
let sessionsBase: string
let mainDir: string

test.beforeAll(() => {
  const tgz = process.env.ATLASWEB_TGZ!
  installed = installTgz(tgz)
  sessionsBase = mkdtempSafe('atlasweb-sessions-')
  const root = createSessionRoot(sessionsBase)
  mainDir = root.mainDir
})

test.afterAll(() => {
  if (installed) cleanupInstalled(installed)
})

/** 对照腿共用：起源码宿主 + 已安装 dist，浏览器兑换后打开首页。 */
async function openApp(page: Page): Promise<SourceHostHandle> {
  const staticDir = join(installed.installDir, 'node_modules', '@atlaswork', 'atlasweb', 'dist')
  expect(existsSync(staticDir), 'installed package must ship dist/').toBe(true)
  const host = await launchSourceHostReproduction({ sessionsDir: mainDir, staticDir })
  await page.goto(host.redeemUrl) // 打开链接：兑换 cookie（单次性）
  await expect(page.getByText('Atlas')).toBeVisible({ timeout: 15_000 }).catch(() => {})
  await page.goto(`${host.baseUrl}/`)
  return host
}

test('[对照] 0.1.3 安装包无 bin 入口', () => {
  // 反例①（reaudit 行 1）：清单无 bin 字段；.bin/atlasweb 不存在。
  // 这是"记录缺口"形断言：0.1.3 事实如此；候选（A1+）将有 bin，
  // 该腿届时由 A1 的正向安装腿取代（本对照腿仅对旧版制品运行）。
  expect(installed.manifest.bin).toBeUndefined()
  expect(installed.manifest.files?.includes('dist')).toBe(true)
  expect(existsSync(join(installed.installDir, 'node_modules', '@atlaswork', 'atlasweb', '.bin', 'atlasweb'))).toBe(false)
})

test('[对照] 0.1.3 长会话尾部 m360 不可达', async ({ page }) => {
  const host = await openApp(page)
  try {
    await page.click('[data-session-id="long-0360"]')
    await expect(page.locator('[data-transcript] .web-code-message').first()).toBeVisible({ timeout: 20_000 })

    // 真实用户滚到底：reaudit 程序 =「多次触底」——3 轮 wheel 触底（每轮
    // 触底后窗口至多前进一步，12+ 轮机械 ratchet 会人为收敛到尾部，非
    // 用户现实操作，不算可达证据）。
    const transcript = page.locator('[data-transcript]')
    for (let round = 0; round < 3; round++) {
      await transcript.hover()
      await page.mouse.wheel(0, 40_000)
      await page.waitForTimeout(200)
    }

    // 反例②：多次触底后 m360 仍不可见且未挂载（固定估高切片只挂载中段
    // 窗）；挂载消息数有界（< 360），滚动总高度不含全跨度占位。
    const mounted = page.locator('[data-transcript] .web-code-message')
    await expect(mounted.first()).toBeVisible()
    const count = await mounted.count()
    expect(count, '0 < mounted < 360（有界切片，无全高占位）').toBeGreaterThan(0)
    expect(count).toBeLessThan(360)
    await expect(page.locator('[data-message-id="m360"]')).toHaveCount(0)
  } finally {
    host.close()
  }
})

test('[对照] 0.1.3 刷新后选择丢失', async ({ page }) => {
  const host = await openApp(page)
  try {
    await page.click('[data-session-id="short-0001"]')
    await expect(page.locator('[data-transcript] .web-code-message').first()).toBeVisible({ timeout: 20_000 })
    await page.reload()
    // 反例③：刷新回空面——"No session open."，selected 为空。
    await expect(page.getByText('No session open.')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('[data-session-id][data-selected]')).toHaveCount(0)
  } finally {
    host.close()
  }
})
