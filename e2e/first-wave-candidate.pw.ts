/**
 * 第一波候选腿（A1：已安装软件包的一条启动命令）。
 *
 * 与 A0 对照腿的边界：本文件全部正断言走已安装包的 `.bin/atlasweb`
 * （Node 运行、PATH 剥 bun、静态根 = npmEntry 固定的包内 dist/）——
 * 禁止走源码宿主回退（plan A1 判据原文）。
 *
 * 腿（plan A1 RED 名）：
 * 1. `installed bin opens AtlasWeb` — 离线临时安装 → node 跑 bin →
 *    搜索框可见（全 UI 可达）。
 * 2. `expired link explains recovery` — 单次 token 已消费后无凭据访问 →
 *    role='alert' 恢复指引含 'atlasweb'；无授权会话请求仍 401。
 * 3. `bad scope fails closed` — 缺 --scope → 非零退出且零就绪行（无 listener）。
 * 4. server bundle 不经静态 HTTP 路径服出。
 *
 * 报告卫生：令牌只在 runner 内存；不输出宿主绝对路径。
 */
import { expect, test, type Page } from '@playwright/test'
import { cleanupInstalled, createSessionRoot, installTgz, launchInstalledBin, mkdtempSafe, type InstalledApp, type InstalledBinHandle } from './fixtures/installedApp'

let installed: InstalledApp
let sessionsBase: string
let mainDir: string

test.beforeAll(() => {
  installed = installTgz(process.env.ATLASWEB_TGZ!)
  sessionsBase = mkdtempSafe('atlasweb-candidate-sessions-')
  mainDir = createSessionRoot(sessionsBase).mainDir
})

test.afterAll(() => {
  if (installed) cleanupInstalled(installed)
})

/** 候选腿共用：安装包 bin 启动 + 浏览器兑换打开。 */
async function openInstalledApp(page: Page): Promise<InstalledBinHandle> {
  const host = await launchInstalledBin(installed, mainDir)
  await page.goto(host.redeemUrl) // 单次兑换 → HttpOnly cookie（响应体 {ok:true}）
  await page.goto(`${host.baseUrl}/`) // 兑换后载入 UI（同源 cookie 面随发）
  await expect(page.getByRole('textbox', { name: 'Search sessions' })).toBeVisible({ timeout: 20_000 })
  return host
}

test('installed bin opens AtlasWeb', async ({ page }) => {
  const host = await openInstalledApp(page)
  try {
    // 全 UI 可达：短样本会话行在场（列表从已装 bundle 的载体运行时读取）。
    await expect(page.locator('[data-session-id="short-0001"]')).toBeVisible({ timeout: 20_000 })
  } finally {
    host.close()
  }
})

test('expired link explains recovery', async ({ page }) => {
  const host = await launchInstalledBin(installed, mainDir)
  try {
    // 服务端消费掉单次 token（runner 侧 fetch 兑换一次）。
    const redeem = await fetch(host.redeemUrl)
    expect(redeem.ok, 'first redemption must succeed').toBe(true)
    // 无凭据浏览器携已消费 token 重访 → 兑换 401 → 恢复指引（不崩空、不自动授权）。
    await page.goto(`${host.baseUrl}/?token=${encodeURIComponent(host.token)}`)
    await expect(page.getByRole('alert')).toContainText('atlasweb', { timeout: 20_000 })
    // 无授权会话请求仍 401（fail-closed 零漂移）。
    const res = await page.request.get(`${host.baseUrl}/sessions?scopeId=main`)
    expect(res.status()).toBe(401)
  } finally {
    host.close()
  }
})

test('bad scope fails closed', async () => {
  const { spawn } = await import('node:child_process')
  const { dirname, join } = await import('node:path')
  const binPath = join(installed.installDir, 'node_modules', '.bin', 'atlasweb')
  const nodeDir = dirname(process.execPath)
  const bunlessPath = [nodeDir, ...(process.env.PATH ?? '').split(':').filter(seg => seg.length > 0 && !seg.includes('bun'))].join(':')
  const child = spawn(binPath, ['--port', '0'], {
    cwd: installed.installDir,
    env: { ...process.env, PATH: bunlessPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  child.stdout?.on('data', (d: Buffer) => { stdout += d.toString() })
  const code = await new Promise<number>(resolve => child.once('exit', c => resolve(c ?? -1)))
  expect(code, 'missing --scope must exit non-zero').not.toBe(0)
  expect(stdout).not.toContain('"ready"')
})

test('server bundle is not served via the static HTTP path', async ({ page }) => {
  const host = await openInstalledApp(page)
  try {
    const res = await page.request.get(`${host.baseUrl}/server/atlasweb.js`)
    expect([401, 404]).toContain(res.status())
    expect(await res.text()).not.toContain('#!')
  } finally {
    host.close()
  }
})
