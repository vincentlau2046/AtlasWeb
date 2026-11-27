/**
 * B3 自腿（收尾工单 §1 切片 1 判据原文 + §4 判据格 2；r-20261127-closure-verdict
 * 格 2 缺口销项件）：`completes and reopens an isolated coding task`——隔离编码
 * 任务全程（改文件 → 跑测试 → 刷新回读）+ B3 双卡 data-* 词表断言
 * （R-B3-1 StatusStrip / R-B3-2 DeliverablesCard「转录推导」自陈面）。
 *
 * 与 first-wave-execution.pw.ts 的边界：执行 8 腿各证单点语义（提交幂等/隔离/
 * 取消/重连/审批内核证据）；本腿 = B3 产品面全程——真实多工具任务（引擎
 * Read/Edit/Write/Bash 链）+ StatusStrip/DeliverablesCard 全程投影 + reload
 * 回读（E6 形）+ 工作区 fs 终证（runner 亲自重跑任务测试，非卡面自述）。
 *
 * 形纪律：
 * - 隔离临时工作区 + 临时 ATLAS_CONFIG_DIR = launchInstalledBinExecution 内建
 *   （b12 R4 定谳形：host --scope 目录 ≡ 引擎落盘 project 目录）。
 * - 引擎工具授权：settings 非全放行 → 审批卡随时出现；腿内循环真 UI 批准
 *   （data-exec-approve 按钮，非 wire 旁路），不预设审批次数。
 * - data-* 断言词表纪律照旧：data-status-strip/-strip-* 与 data-deliverables*
 *   全部出自 views 源（StatusStrip.tsx / DeliverablesCard.tsx），零词表外选择器。
 *
 * 报告卫生：令牌只在 runner 内存；不输出宿主绝对路径。
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { cleanupInstalled, installTgz, launchInstalledBinExecution, type ExecutionHostHandle, type InstalledApp } from './fixtures/installedApp'

let installed: InstalledApp

test.beforeAll(() => {
  installed = installTgz(process.env.ATLASWEB_TGZ!)
})

test.afterAll(() => {
  if (installed) cleanupInstalled(installed)
})

const TASK_PROMPT = [
  'The file calc.js in the current directory exports add(a, b) but it is buggy:',
  'add(2, 2) returns 5. Fix calc.js so that add(2, 2) returns 4. Then create',
  'test.js in the current directory that requires ./calc.js, uses node:assert',
  'to verify add(2, 2) === 4, and prints PASS when it holds. Run node test.js',
  'and make sure it prints PASS.',
].join(' ')

/** 磁盘证据：会话 JSONL 的 user 行数（引擎回合起点落盘形，R4 探针定谳）。 */
function userLineCount(host: ExecutionHostHandle): number {
  const lines = readFileSync(join(host.scopeDir, 'short-0001.jsonl'), 'utf8').split('\n').filter(l => l.trim().length > 0)
  return lines.filter(l => { try { return (JSON.parse(l) as { type?: unknown }).type === 'user' } catch { return false } }).length
}

/** 任务材料：带 bug 的 calc.js（改文件半边起点；add(2,2) 现为 5）。 */
const BUGGY_CALC = 'function add(a, b) { return a + b + 1 }\nmodule.exports = { add }\n'

function calcResult(host: ExecutionHostHandle): string {
  return execFileSync('node', ['-e', 'process.stdout.write(String(require("./calc.js").add(2, 2)))'], {
    cwd: host.workspaceDir,
    encoding: 'utf8',
  })
}

test('installed app completes and reopens an isolated coding task', async ({ page }) => {
  test.setTimeout(300_000)
  const host = await launchInstalledBinExecution(installed)
  try {
    // 任务材料预证：bug 实在场（修复半边有真起点）。
    writeFileSync(join(host.workspaceDir, 'calc.js'), BUGGY_CALC, 'utf8')
    expect(calcResult(host), 'precondition: calc.js is buggy (add(2,2) === 5)').toBe('5')

    const baseline = userLineCount(host)
    await page.goto(host.redeemUrl)
    await page.goto(`${host.baseUrl}/?workspace=${encodeURIComponent(host.workspaceId)}&session=short-0001`)
    await expect(page.locator('[data-exec-composer]')).toBeVisible({ timeout: 20_000 })

    // R-B3-1：StatusStrip 执行通道挂载即在场（纯投影；phase 随状态机非空）。
    const strip = page.locator('[data-status-strip]')
    await expect(strip).toBeVisible()
    await expect(strip).toHaveAttribute('data-strip-phase', /.+/)
    // R-B3-2：DeliverablesCard 随种子会话在场（种子 4 条纯文本 → 工具活动 0）
    // + 「转录推导」自陈面（F8 不造假条款：卡面自陈推导来源）。
    // 注：data-deliverables-activities 在卡面子 div（词表源 DeliverablesCard.tsx）。
    const card = page.locator('[data-deliverables]')
    await expect(card).toBeVisible()
    await expect(page.locator('[data-deliverables-activities]')).toHaveAttribute('data-deliverables-activities', '0')
    await expect(page.locator('[data-deliverables-derived]')).toBeVisible()

    // 提交真实任务 → running（UI 发送，非 wire 旁路）。
    await page.locator('[data-exec-input]').fill(TASK_PROMPT)
    await page.locator('[data-exec-submit]').click()
    await expect(page.locator('[data-exec-running]')).toBeVisible({ timeout: 30_000 })
    await expect(strip.locator('[data-strip-running]')).toBeVisible({ timeout: 30_000 })

    // 引擎工具链按授权对表出审批卡 → 真按钮批准，循环至回合收口（队列排空）。
    // 不预设审批次数；点击竞态（卡面结算 detach）容忍，下轮重扫。
    const deadline = Date.now() + 240_000
    while (true) {
      const approval = page.locator('[data-exec-approval]').first()
      if ((await approval.count()) > 0) {
        const approvalId = await approval.getAttribute('data-exec-approval')
        if (approvalId) {
          try {
            await page.locator(`[data-exec-approve="${approvalId}"]`).click({ timeout: 2_000 })
          } catch { /* 卡面已在结算 detach——重扫 */ }
        }
      }
      if ((await page.locator('[data-exec-queue]').count()) === 0) break
      if (Date.now() > deadline) throw new Error('timeout: isolated task turn to settle (queue drain)')
      await page.waitForTimeout(500)
    }

    // 工作区 fs 终证：修复真落地（runner 亲自重跑任务测试——非卡面转述）。
    const testOut = execFileSync('node', ['test.js'], { cwd: host.workspaceDir, encoding: 'utf8' })
    expect(testOut, 'task test run passes in the isolated workspace').toContain('PASS')
    expect(calcResult(host), 'calc.js fix landed (add(2,2) === 4)').toBe('4')

    // R-B3-2 全程投影：真实工具链 → 工具活动 ≥1 + 派生摘要在场。
    await expect(card).toBeVisible()
    await expect
      .poll(async () => Number(await page.locator('[data-deliverables-activities]').getAttribute('data-deliverables-activities')), { timeout: 30_000 })
      .toBeGreaterThanOrEqual(1)
    await expect(page.locator('[data-deliverables-summary]')).toBeVisible()

    // R-B3-1 收口投影：running 清、状态条仍在（收口后终态投影）。
    await expect(strip.locator('[data-strip-running]')).toHaveCount(0)

    // 磁盘证据：回合落盘（jsonl 形里 tool_result 亦 type:'user'，断增长）。
    expect(userLineCount(host), 'task turn persists its prompt line').toBeGreaterThan(baseline)

    // 'reopens' 半边：刷新回读——转录、双卡同源可见（E6 形）。
    await page.reload()
    await expect(page.locator('[data-transcript]')).toContainText('calc.js', { timeout: 30_000 })
    await expect(page.locator('[data-status-strip]')).toBeVisible()
    const reopenedCard = page.locator('[data-deliverables]')
    await expect(reopenedCard).toBeVisible()
    await expect
      .poll(async () => Number(await page.locator('[data-deliverables-activities]').getAttribute('data-deliverables-activities')), { timeout: 30_000 })
      .toBeGreaterThanOrEqual(1)
    await expect(page.locator('[data-deliverables-derived]')).toBeVisible()
  } finally {
    host.close()
  }
})
