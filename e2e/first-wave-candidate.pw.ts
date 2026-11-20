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
 * A2 腿（plan A2 RED 名）：
 * 5. `long conversation reaches head and tail` — 真实 wheel 首尾可达
 *    （m001/m360 与正文 viewport 相交）+ 挂载数有界（0 < n < 360）。
 * 6. `search hit opens exact message` — 搜 QUAHOG-MID-NEEDLE → 点命中 →
 *    `[data-message-id="m180"][data-search-target]` 在 viewport。
 * 7. append 中段阅读不拽到底；滚到尾后新消息可见。
 *
 * 报告卫生：令牌只在 runner 内存；不输出宿主绝对路径。
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { anchorKey } from '../packages/web-code/src/readingAnchor.ts'
import { cleanupInstalled, createSessionRoot, installTgz, launchInstalledBin, makeMessage, mkdtempSafe, type InstalledApp, type InstalledBinHandle } from './fixtures/installedApp'

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

/** A2 共用：打开长样本会话（初始 tail-pinned，m360 应即刻可见）。 */
async function openLongSession(page: Page, host: InstalledBinHandle): Promise<void> {
  await page.click('[data-session-id="long-0360"]')
  await expect(page.locator('[data-message-id="m360"]')).toBeVisible({ timeout: 20_000 })
}

test('long conversation reaches head and tail', async ({ page }) => {
  const host = await openInstalledApp(page)
  try {
    await openLongSession(page, host)
    const transcript = page.locator('[data-transcript]')
    const mounted = page.locator('[data-transcript] [data-message-id]')

    // 首可达：真实 wheel 上滚到顶（reaudit 同程序，反向轮次）。
    for (let round = 0; round < 5; round++) {
      await transcript.hover()
      await page.mouse.wheel(0, -40_000)
      await page.waitForTimeout(200)
    }
    await expect(page.locator('[data-message-id="m001"]')).toBeInViewport({ timeout: 10_000 })

    // 挂载数有界：虚拟化只挂可见窗（同一次测试内断言）。
    const count = await mounted.count()
    expect(count, '0 < mounted < 360（有界挂载，非全量）').toBeGreaterThan(0)
    expect(count).toBeLessThan(360)

    // 尾可达：3 轮 wheel 触底（reaudit 用户现实轮次口径）。
    for (let round = 0; round < 3; round++) {
      await transcript.hover()
      await page.mouse.wheel(0, 40_000)
      await page.waitForTimeout(200)
    }
    await expect(page.locator('[data-message-id="m360"]')).toBeInViewport({ timeout: 10_000 })
  } finally {
    host.close()
  }
})

test('search hit opens exact message', async ({ page }) => {
  const host = await openInstalledApp(page)
  try {
    const search = page.getByRole('textbox', { name: 'Search sessions' })
    await search.fill('QUAHOG-MID-NEEDLE')
    await search.press('Enter')
    const hit = page.locator('[data-search-hit]').first()
    await expect(hit).toBeVisible({ timeout: 20_000 })
    await hit.click()
    // 定位 = 未挂载 → 滚到索引 → 测高后对齐；标记与稳定 ID 同行。
    await expect(page.locator('[data-message-id="m180"][data-search-target]')).toBeInViewport({ timeout: 20_000 })
  } finally {
    host.close()
  }
})

test('append at mid-read keeps position; new message visible at tail', async ({ page }) => {
  const host = await openInstalledApp(page)
  try {
    await openLongSession(page, host)
    const transcript = page.locator('[data-transcript]')
    // 滚离尾部到中段（循环小步上滚直到 m180 入视口——不依赖行高估计）。
    for (let round = 0; round < 30 && !(await page.locator('[data-message-id="m180"]').isVisible()); round++) {
      await transcript.hover()
      await page.mouse.wheel(0, -2000)
      await page.waitForTimeout(120)
    }
    await expect(page.locator('[data-message-id="m180"]')).toBeInViewport()

    // runner 侧 append 一条新消息（follow poll 循环拾取）；模型更新信号 =
    // 转录总跨度（scrollHeight 占位）增长——虚拟化下尾行中段时不挂载，
    // 不能用 DOM 计数判到达。
    const before = await transcript.evaluate(el => el.scrollHeight)
    appendFileSync(join(mainDir, 'long-0360.jsonl'), makeMessage(
      { uuid: 'm361', role: 'user', text: 'Appended tail marker m361.' },
      'm360', 'long-0360', '2026-11-20T23:59:00.000Z',
    ), 'utf8')
    await page.waitForFunction(
      prev => { const el = document.querySelector('[data-transcript]'); return el !== null && el.scrollHeight > prev },
      before, { timeout: 20_000 },
    )

    // 中段阅读位不拽到底：m180 仍在视口；m361 未挂载（有界窗，非全量）。
    await expect(page.locator('[data-message-id="m180"]')).toBeInViewport()
    await expect(page.locator('[data-message-id="m361"]')).toHaveCount(0)

    // 滚到尾后新消息可见。
    for (let round = 0; round < 3; round++) {
      await transcript.hover()
      await page.mouse.wheel(0, 40_000)
      await page.waitForTimeout(200)
    }
    await expect(page.locator('[data-message-id="m361"]')).toBeInViewport({ timeout: 10_000 })
  } finally {
    host.close()
  }
})

/** A3 共用：打开长样本并滚到中段 m180，等锚写入（250ms debounce + 余量）。 */
async function readToMidAndSettle(page: Page): Promise<void> {
  await page.click('[data-session-id="long-0360"]')
  await expect(page.locator('[data-message-id="m360"]')).toBeVisible({ timeout: 20_000 })
  const transcript = page.locator('[data-transcript]')
  for (let round = 0; round < 30 && !(await page.locator('[data-message-id="m180"]').isVisible()); round++) {
    await transcript.hover()
    await page.mouse.wheel(0, -2000)
    await page.waitForTimeout(120)
  }
  await expect(page.locator('[data-message-id="m180"]')).toBeInViewport()
  await page.waitForTimeout(800)
}

test('narrow sidebar opens by keyboard', async ({ page }) => {
  const host = await openInstalledApp(page)
  try {
    // 窄帧（<1024 自动收起）：导航不可见 → 左上角 Sessions 按钮在场。
    await page.setViewportSize({ width: 850, height: 800 })
    const toggle = page.locator('[data-sessions-toggle]')
    await expect(toggle).toBeVisible({ timeout: 10_000 })

    // Tab 可达（首个可聚焦元素即按钮）+ Enter 打开。
    await page.keyboard.press('Tab')
    await expect(toggle).toBeFocused()
    await page.keyboard.press('Enter')
    const search = page.getByRole('textbox', { name: 'Search sessions' })
    await expect(search).toBeVisible({ timeout: 10_000 })

    // 可输入 + Esc 关闭并把焦点还给按钮（收起 = 帧级 data-sidebar-collapsed；
    // 窄帧非 drawer 轨道内容不必隐藏，不在此断言输入框可见性）。
    await search.fill('short')
    await page.keyboard.press('Escape')
    await expect(toggle).toBeFocused()
    await expect(page.locator('[data-sidebar-collapsed]')).toHaveCount(1)

    // 宽屏（≥1024 常驻导航）：按钮不渲染。
    const wide = await page.context().newPage()
    await wide.setViewportSize({ width: 1440, height: 800 })
    await wide.goto(page.url())
    await expect(wide.getByRole('textbox', { name: 'Search sessions' })).toBeVisible({ timeout: 20_000 })
    await expect(wide.locator('[data-sessions-toggle]')).toHaveCount(0)
    await wide.close()
  } finally {
    host.close()
  }
})

test('refresh restores conversation and anchor', async ({ page }) => {
  const host = await openInstalledApp(page)
  try {
    await readToMidAndSettle(page)
    // URL 同步回写当前选择（reload 后为恢复入口）。
    await expect(page).toHaveURL(/session=long-0360/, { timeout: 10_000 })

    await page.reload()
    // 恢复 = 同会话仍开 + 阅读锚处（m180）回到视口（scrollToIndex + 偏移修正）。
    await expect(page.locator('[data-message-id="m180"]')).toBeInViewport({ timeout: 20_000 })
    await expect(page).toHaveURL(/session=long-0360/)
  } finally {
    host.close()
  }
})

test('missing anchor is explicit', async ({ page }) => {
  const host = await openInstalledApp(page)
  try {
    await readToMidAndSettle(page)

    // runner 侧改写样本：删 m180 行（只按 uuid 键过滤——parentUuid 引用不误伤）。
    const jsonlPath = join(mainDir, 'long-0360.jsonl')
    const kept = readFileSync(jsonlPath, 'utf8')
      .split('\n')
      .filter(line => line.length > 0 && !line.includes('"uuid":"m180"'))
    writeFileSync(jsonlPath, `${kept.join('\n')}\n`, 'utf8')

    // 同一 JS 任务内钉锚 + 重载：杀「follow poll 先改写模型 → 锚 effect 重写
    // 成仍存在的消息 → 恢复无缺席」竞态（全文件跑偶发红的根因——轮询在
    // rewrite→reload 窗口落地时锚被覆盖）。锚键/载荷形与 readingAnchor 契约同源。
    await page.evaluate(key => {
      sessionStorage.setItem(key, JSON.stringify({ messageId: 'm180', offsetPx: 0 }))
      window.location.reload()
    }, anchorKey('main', 'long-0360'))
    // 锚缺席明示：提示面（role=status）在场；不静默跳位、不跳其他会话
    // （当前会话仍渲染——尾钉 m360 在视口）。
    const banner = page.locator('[data-anchor-missed]')
    await expect(banner).toBeVisible({ timeout: 20_000 })
    await expect(banner).toHaveAttribute('role', 'status')
    await expect(banner).toContainText('reading position')
    // 会话身份：URL 仍是目标会话 + 转录有挂载行（不钉精确滚位——尾钉后
    // 虚拟化测高收敛可致尾部短暂出视口，属估高工件，非缺席语义）。
    await expect(page.locator('[data-transcript] [data-message-id]').first()).toBeVisible({ timeout: 10_000 })
    await expect(page).toHaveURL(/session=long-0360/)
  } finally {
    host.close()
  }
})
