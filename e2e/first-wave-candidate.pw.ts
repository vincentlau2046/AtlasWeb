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
 * A4 腿（plan A4 RED 名）：
 * 11. `disconnect catches up exactly once` — SIGSTOP 冻结 bin（真「阻断当前
 *     follow」），冻结期 append offline-1/offline-2，SIGCONT 后经既有流以
 *     replacement 送达：两条各恰一次、顺序正确；阅读位（m180）保持、
 *     旧锚仍在（sessionStorage 锚指向既有消息）。
 * 12. `expired cursor replaces baseline` — 路由面伪造携带过期 cursor 的
 *     baseline（幽灵消息）→ 流异常终止 → 适配器持过期 cursor 续接 →
 *     服务端 resetRequired → 无 cursor 重开 → 真基线整替：幽灵消失、
 *     真消息在场（不把旧消息并入）。
 * 13. `unrecoverable connection offers retry` — follow 全断（> 重试预算）→
 *     合成 connectionLost 终态对 → 错误面 + Retry 按钮可达；解除阻断后
 *     手动重试恢复，且在途 follow 恰一条（不是第二份活跃 follow）。
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
  // fixture 是 beforeAll 共享目录：本腿 append m361（parentUuid=m360）——不恢复
  // 会让后续腿的 m360 出现双子分叉（有效链取更晚叶子，offline 消息被投影
  // 丢弃，A4 腿 11 全文件跑定谳）。finally 必须恢复原样。
  const jsonlPath = join(mainDir, 'long-0360.jsonl')
  const original = readFileSync(jsonlPath, 'utf8')
  try {
    await openLongSession(page, host)
    const transcript = page.locator('[data-transcript]')
    // 滚离尾部到中段（viewport 根修波工单 §2 根修 helper——容器相交退出判据
    // + mounted 后 bbox 双向校正；旧形 isVisible() 提前退出缺陷见 helper 注释）。
    await scrollMidToM180(page)
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
    writeFileSync(join(mainDir, 'long-0360.jsonl'), original, 'utf8')
    host.close()
  }
})

/**
 * 中段滚位根修 helper（viewport 根修波工单 §2 修形①，test-side only）。
 *
 * 旧形缺陷（R1 探针直证，e2e/r1-probe.pw.ts @ 锚 #2 实跑报告归档 job tmp）：
 * 旧循环退出条件 = `isVisible()`（有 bounding box 即真）——虚拟化
 * （@tanstack/react-virtual，REPLAY_WINDOW_SIZE=60 + REPLAY_OVERSCAN=10，
 * overscan 带实测 ≈620px）下 **overscan 缓冲行挂载即 isVisible=true**：
 * 探针第 6 轮 m180 挂载于 transcript 容器下缘外 8px（m180 top 595 vs 容器
 * bottom 587，挂载窗 160-189 / index 180 在 overscan 带内）→ 循环提前退出
 * → 断言 `toBeInViewport` ratio 0（Playwright 计入祖先 overflow 裁剪面）
 * ×3 确定性红。步长 residue 漂移（实际步长 ≈1906-1908px vs 请求 2000，
 * 成功窗宽 ≈(H+h)/2000≈30%）+ B 系 chrome（01081e4 DeliverablesCard 实测
 * 109px 纵向占位）改 H 后相位落 skip 带 → A-gate 时代几何巧合失效。
 *
 * 根修形（工单 §2 修形① mounted 后 bbox 双向校正）：
 * - 退出判据 = m180 boundingClientRect 与 transcript 容器相交 ≥1px（轮内
 *   page.evaluate 自算——滚动机制正确参照；最终门 = 调用方 toBeInViewport
 *   断言零改动，两谓词非同一、不一致时断言如实红，禁为对齐断言改断言）；
 * - mounted 后按侧别双向校正：处容器上带 → 匀相 wheel -400px（内容下移、
 *   m180 自顶入视）；处下带 → 匀相 wheel +400px（内容上移、m180 自底入视）；
 * - unmounted 粗相沿尾→头行进方向 -2000px；若上轮已见下带（越过）则回滚收；
 * - 30 轮预算耗尽不判死：最终门交 toBeInViewport 断言如实红（§2 谓词纪律）。
 * 参数钉（工单 §6-5）：粗相 -2000px/120ms、匀相 ≤400px、轮数上限 30、
 * 禁 scrollIntoViewIfNeeded（改变受测滚动机理——产品锚恢复 = 真滚位驱动）。
 */
async function scrollMidToM180(page: Page): Promise<void> {
  const transcript = page.locator('[data-transcript]')
  let lastSide: 'above' | 'below' = 'above'
  for (let round = 0; round < 30; round++) {
    const side = await page.evaluate((): 'above' | 'below' | 'intersect' | 'unmounted' => {
      const el = document.querySelector('[data-transcript]')
      const m = document.querySelector('[data-message-id="m180"]')
      if (el === null || m === null) return 'unmounted'
      const c = el.getBoundingClientRect()
      const r = m.getBoundingClientRect()
      if (r.bottom <= c.top) return 'above'
      if (r.top >= c.bottom) return 'below'
      return 'intersect'
    })
    if (side === 'intersect') return
    await transcript.hover()
    if (side === 'above') {
      await page.mouse.wheel(0, -400)
      lastSide = 'above'
    } else if (side === 'below') {
      await page.mouse.wheel(0, 400)
      lastSide = 'below'
    } else {
      // unmounted：粗相行进（尾→头）；若上轮已见下带则已被越过，回滚收。
      await page.mouse.wheel(0, lastSide === 'below' ? 400 : -2000)
    }
    await page.waitForTimeout(120)
  }
}

/** A3 共用：打开长样本并滚到中段 m180，等锚写入（250ms debounce + 余量）。 */
async function readToMidAndSettle(page: Page): Promise<void> {
  await page.click('[data-session-id="long-0360"]')
  await expect(page.locator('[data-message-id="m360"]')).toBeVisible({ timeout: 20_000 })
  await scrollMidToM180(page)
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
    // <1024 现为真 drawer：收起侧栏内容 inert——搜索框/行按钮不得留在
    // Tab 序列（reviewer Fix 6：850px 曾只扩 grid track，焦点逃逸到
    // 不可见交互面））。
    await search.fill('short')
    await page.keyboard.press('Escape')
    await expect(toggle).toBeFocused()
    await expect(page.locator('[data-sidebar-collapsed]')).toHaveCount(1)
    // 收起 = 内容 inert：搜索框不可见且不在可达树。
    await expect(search).toBeHidden()
    const inert = await page.evaluate(() => {
      const col = document.querySelector('[data-sidebar-collapsed] [class*="sidebarCol"]')
      return col !== null && col.hasAttribute('inert')
    })
    expect(inert, 'collapsed drawer content must be inert').toBe(true)

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
    // 锚契约 = 「锚处回到视口」非「=m180」（与腿 11 同一裁定）：helper 的
    // -2000px 步进滚动只保证 m180 可见——锚 effect 写的是视口顶行，可能是
    // m171 等更早的高行（DBG 定谳：m171/offsetPx 0，恢复后 m180 恰在折叠线
    // 下 62px，恢复本身忠实）。断言恢复后锚消息本身回视口，对锚落点不敏感。
    const anchorRaw = await page.evaluate(key => sessionStorage.getItem(key), anchorKey('main', 'long-0360'))
    expect(anchorRaw).not.toBeNull()
    const restoredMessageId = (JSON.parse(anchorRaw!) as { messageId: string }).messageId

    await page.reload()
    // 恢复 = 同会话仍开 + 阅读锚处回到视口（scrollToIndex + 偏移修正）。
    await expect(page.locator(`[data-message-id="${restoredMessageId}"]`)).toBeInViewport({ timeout: 20_000 })
    await expect(page).toHaveURL(/session=long-0360/)
  } finally {
    host.close()
  }
})

test('missing anchor is explicit', async ({ page }) => {
  const host = await openInstalledApp(page)
  // fixture 是 beforeAll 共享目录：本腿删 m180 行改写样本，A4 腿排到其后——
  // finally 必须恢复原样，否则 m180 永久缺席，后续腿的 m180 依赖全部落空。
  const jsonlPath = join(mainDir, 'long-0360.jsonl')
  const original = readFileSync(jsonlPath, 'utf8')
  try {
    await readToMidAndSettle(page)

    // runner 侧改写样本：删 m180 行（只按 uuid 键过滤——parentUuid 引用不误伤）。
    const kept = original
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
    writeFileSync(join(mainDir, 'long-0360.jsonl'), original, 'utf8')
    host.close()
  }
})

test('disconnect catches up exactly once', async ({ page }) => {
  const host = await openInstalledApp(page)
  try {
    await readToMidAndSettle(page)
    // 补齐证据基线：冻结前的转录总跨度（scrollHeight 占位——虚拟化下离线
    // 消息不挂载，跨度增长 = 模型已吸收，先于锚比对的「补齐已证实」）。
    const spanBefore = await page.locator('[data-transcript]').evaluate(el => el.scrollHeight)
    // 冻结前的锚（锚写视口顶可见消息，非特定 needle——契约是「不变」非「=m180」）。
    const anchorBefore = await page.evaluate(key => sessionStorage.getItem(key), anchorKey('main', 'long-0360'))
    expect(anchorBefore).not.toBeNull()

    // 真「阻断当前 follow」：SIGSTOP 冻结 bin 进程——既有 SSE 连接保持但
    // 服务面停摆；冻结期 runner 侧追加两条离线消息。
    process.kill(host.pid, 'SIGSTOP')
    try {
      appendFileSync(join(mainDir, 'long-0360.jsonl'), makeMessage(
        { uuid: 'm-offline-1', role: 'user', text: 'Offline catch-up marker one.' },
        'm360', 'long-0360', '2026-11-20T23:58:00.000Z',
      ), 'utf8')
      appendFileSync(join(mainDir, 'long-0360.jsonl'), makeMessage(
        { uuid: 'm-offline-2', role: 'assistant', text: 'Offline catch-up marker two.' },
        'm-offline-1', 'long-0360', '2026-11-20T23:58:30.000Z',
      ), 'utf8')
      await page.waitForTimeout(1500)
    } finally {
      process.kill(host.pid, 'SIGCONT')
    }

    // 恢复：follow 既有流以 replacement 送达。先证实补齐（跨度增长），
    // 再比阅读位（reviewer Fix 3：锚断言不得先于补齐证据）。
    await page.waitForFunction(
      prev => { const el = document.querySelector('[data-transcript]'); return el !== null && el.scrollHeight > prev },
      spanBefore, { timeout: 20_000 },
    )
    const anchorMessageId = (JSON.parse(anchorBefore!) as { messageId: string }).messageId
    await expect(page.locator(`[data-message-id="${anchorMessageId}"]`)).toBeInViewport({ timeout: 20_000 })
    // 旧锚仍在：恢复后锚与冻结前逐字节一致（A3 契约不漂、不被重连改写）。
    const anchorAfter = await page.evaluate(key => sessionStorage.getItem(key), anchorKey('main', 'long-0360'))
    expect(anchorAfter).toBe(anchorBefore)

    // 滚到尾：两条各恰一次、顺序正确。
    const transcript = page.locator('[data-transcript]')
    for (let round = 0; round < 3; round++) {
      await transcript.hover()
      await page.mouse.wheel(0, 40_000)
      await page.waitForTimeout(200)
    }
    const off1 = page.locator('[data-message-id="m-offline-1"]')
    const off2 = page.locator('[data-message-id="m-offline-2"]')
    await expect(off1).toBeVisible({ timeout: 10_000 })
    await expect(off2).toBeVisible({ timeout: 10_000 })
    await expect(off1).toHaveCount(1)
    await expect(off2).toHaveCount(1)
    const order = await page.evaluate(() => {
      const a = document.querySelector('[data-message-id="m-offline-1"]')
      const b = document.querySelector('[data-message-id="m-offline-2"]')
      if (a === null || b === null) return 0
      return a.getBoundingClientRect().top < b.getBoundingClientRect().top ? 1 : -1
    })
    expect(order, 'offline-1 precedes offline-2 in document order').toBe(1)
  } finally {
    host.close()
  }
})

test('expired cursor replaces baseline', async ({ page }) => {
  const host = await openInstalledApp(page)
  // follow 请求观测：重连请求必须携带过期 cursor（伪 baseline 落地并
  // 被采样的证据——整替链真实发生，非拦截未生效的真基线直达）。
  const followUrls: string[] = []
  page.on('request', r => { if (r.url().includes('/follow')) followUrls.push(r.url()) })
  try {
    await page.click('[data-session-id="other-0001"]')
    await expect(page.locator('[data-message-id="m001"]')).toBeVisible({ timeout: 20_000 })

    // 切出再切回，制造新的 follow 请求；路由面接住它并伪造「携带过期
    // cursor 的 baseline」（含幽灵消息）。响应体结束（无 closed）→ 适配器
    // 异常断流路径持过期 cursor 续接 → 真 server resetRequired → 无 cursor
    // 重开 → 真基线整替。
    const pattern = '**/sessions/other-0001/follow*'
    let intercepted = false
    await page.route(pattern, route => {
      if (intercepted) { void route.fallback(); return }
      intercepted = true
      const fakeBaseline = {
        kind: 'baseline', baselineId: 'fake', cursor: 'atlasweb-e2e-expired', generation: 'g0',
        projection: {
          sessionId: 'other-0001', productId: 'atlascode', scopeId: 'main',
          semantics: 'persisted-effective-conversation',
          messages: [{ id: 'ghost-expired', role: 'user', createdAt: null, blocks: [{ kind: 'text', text: 'ghost from stale cursor' }] }],
          truncated: false,
        },
        schemaVersion: 0,
      }
      void route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: `data: ${JSON.stringify(fakeBaseline)}\n\n`,
      })
    })
    await page.click('[data-session-id="short-0001"]')
    await expect(page.locator('[data-message-id="m001"]')).toBeVisible({ timeout: 20_000 })
    await page.click('[data-session-id="other-0001"]')

    // 幽灵在场（伪 baseline 渲染证据；适配器退避 250ms 内可见）→ 整替。
    await expect(page.locator('[data-message-id="ghost-expired"]')).toBeVisible({ timeout: 5_000 })
    // 重连请求携带过期 cursor（异常断流路径持最近交付 cursor 续接的证据）。
    await expect.poll(() => followUrls.some(url => url.includes('cursor=atlasweb-e2e-expired')), { timeout: 10_000 }).toBe(true)
    // 幽灵消失（新基线为准）、真消息在场、状态 live。
    await expect(page.locator('[data-message-id="ghost-expired"]')).toHaveCount(0, { timeout: 20_000 })
    await expect(page.locator('[data-message-id="m001"]')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('[data-message-id="m002"]')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-conn-status="live"]')).toHaveCount(1)
    // 不把旧消息并入：渲染集恰为服务端真值（两条），无幽灵、无重复。
    await expect(page.locator('[data-transcript] [data-message-id="ghost-expired"]')).toHaveCount(0)
    await page.unroute(pattern)
  } finally {
    host.close()
  }
})

test('unrecoverable connection offers retry', async ({ page }) => {
  const host = await openInstalledApp(page)
  // 在途 follow 计数（request 对象恒等；SSE 长连接只在 abort/close 时出集）。
  const inflight = new Set<unknown>()
  const isFollow = (url: string): boolean => url.includes('/follow')
  page.on('request', r => { if (isFollow(r.url())) inflight.add(r) })
  page.on('requestfinished', r => { if (isFollow(r.url())) inflight.delete(r) })
  page.on('requestfailed', r => { if (isFollow(r.url())) inflight.delete(r) })
  try {
    // 选中会话（URL 写 ?session= → 刷新后的自动恢复入口）。
    await page.click('[data-session-id="short-0001"]')
    await expect(page.locator('[data-message-id="m001"]')).toBeVisible({ timeout: 20_000 })
    await expect(page).toHaveURL(/session=short-0001/, { timeout: 10_000 })

    // follow 全断（持续 > 重试预算）：刷新后 boot 自动重开 → 有界重连 →
    // 预算耗尽 → 合成 connectionLost 终态对。
    await page.route('**/sessions/*/follow*', route => { void route.abort() })
    await page.reload()
    const errorFace = page.locator('[data-conn-error]')
    await expect(errorFace).toContainText('connectionLost', { timeout: 20_000 })
    // 「无法恢复可重试」面：Retry 按钮可达（明确反馈，不静默重连死循环）。
    const retry = page.locator('[data-conn-retry]')
    await expect(retry).toBeVisible()

    // 解除阻断 → 手动重试 → 恢复（同会话、消息在场、状态 live）。
    await page.unroute('**/sessions/*/follow*')
    await retry.click()
    await expect(page.locator('[data-message-id="m001"]')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('[data-conn-status="live"]')).toHaveCount(1)
    // 手动重试不是开第二份活跃 follow：恢复后在途 follow 恰一条。
    await page.waitForTimeout(1000)
    expect(inflight.size, 'exactly one live follow stream after manual retry').toBe(1)
    await expect(page).toHaveURL(/session=short-0001/)
  } finally {
    host.close()
  }
})
