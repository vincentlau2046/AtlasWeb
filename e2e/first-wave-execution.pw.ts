/**
 * 第一波执行腿（B 附表 §2 B1 + §3 B2 e2e pw；B2 归档披露① e2e lane 欠账收口）。
 *
 * 与单测的边界：单测 = fake transport / fake runTurn（executionController.test、
 * executionQueueApprovals.test、executionRoutes.test）；本文件全部腿 = 真 server
 * 立判——已安装候选包 bin（ATLASWEB_TGZ）+ --execution 真装配 + 真 CLI 引擎回合
 * （@atlaswork/atlascode pin，R3）+ 隔离临时工作区（R4 统一目录：host scope 目录
 * ≡ 引擎落盘 project 目录，磁盘证据 = 会话 JSONL 行）。
 *
 * 腿（plan §2/§3 RED 名，可达面）：
 * 1. `submit streams and persists a real turn` — UI 发送 → 引擎同回合真实增量
 *    （running→转录 PONG→队列排空）→ JSONL 落盘 → 刷新回读（E6）；
 *    同 submitId 双 POST 只执行一次（E3，引擎侧恰一条 user 行）。
 * 2. `unauthorized workspace never executes` — 未授权 workspace 提交 403
 *    （wire + UI 双路径）且引擎零痕迹（JSONL 行数不变，E1 全腿内核证据口径）。
 * 3. `queue cancel reaches the kernel with exactly one terminal` — FIFO 入队、
 *    等待取消不启动（SSE 无 started + JSONL 零该回合 user 行）、运行取消
 *    恰一个终态（SSE 每 turnId 终态恰一，竞态容忍 cancelled|completed）。
 * 4. `decide with unknown approval is rejected without side effects` — 未知
 *    approvalId decide 被拒（403/404）且零副作用。
 * 5. `execution stream reconnects exactly once` — 断连期完成的回合，cursor
 *    续传重连后各恰好一次（B∪C = 全事件集、交 = ∅、id 全局唯一）。
 *
 * **受阻登记（R2，非静默缺席）**：审批正腿全链（批准后隔离文件实际改变/
 * 拒绝/过期/跨域零改变、双客户端竞态 E4、decide turn-exact 正腿、重连腿的
 * 审批半边）在产品道结构性不可达——spawnCliTurnRunner 不消费 requestApproval
 * （B1 形保留，runTurn 审批接线候后续切片）；kernel/host 审批面已由单测覆盖
 * （executionQueueApprovals.test / executionRoutes.test）。
 *
 * 报告卫生：令牌只在 runner 内存；不输出宿主绝对路径。
 */
import { readFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
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

const PONG_PROMPT = 'Reply with exactly the single word PONG and nothing else.'

/** 打开链接兑换 + 执行面入口（?workspace hint + ?session 提示）。 */
async function openExecutionApp(page: Page, host: ExecutionHostHandle, workspaceId: string): Promise<void> {
  await page.goto(host.redeemUrl)
  await page.goto(`${host.baseUrl}/?workspace=${encodeURIComponent(workspaceId)}&session=short-0001`)
  await expect(page.locator('[data-exec-composer]')).toBeVisible({ timeout: 20_000 })
}

/** 已认证 cookie 头（runner 侧 SSE 用；浏览器上下文兑换后取）。 */
async function cookieHeader(page: Page, host: ExecutionHostHandle): Promise<string> {
  const cookies = await page.context().cookies(host.baseUrl)
  const session = cookies.find(c => c.name === 'atlas_session')
  expect(session, 'session cookie must be present after redemption').toBeDefined()
  return `${session!.name}=${session!.value}`
}

interface SseReader {
  frames: unknown[]
  /** 首字节到达（连接建立证据）。 */
  opened: Promise<void>
  close(): void
}

/** node:http 裸 SSE 读（事件流帧收集；断连 = destroy）。 */
function openExecutionSse(host: ExecutionHostHandle, cookie: string, params: { workspaceId?: string; cursor?: string }): SseReader {
  const frames: unknown[] = []
  let resolveOpened: () => void
  const opened = new Promise<void>(r => { resolveOpened = r })
  const url = new URL(`${host.baseUrl}/execution/events`)
  url.searchParams.set('workspaceId', params.workspaceId ?? host.workspaceId)
  url.searchParams.set('sessionId', 'short-0001')
  if (params.cursor !== undefined) url.searchParams.set('cursor', params.cursor)
  const req = httpRequest(
    url,
    { headers: { cookie, accept: 'text/event-stream' } },
    res => {
      resolveOpened()
      res.setEncoding('utf8')
      let buf = ''
      res.on('data', (chunk: string) => {
        buf += chunk
        let sep: number
        while ((sep = buf.indexOf('\n\n')) >= 0) {
          const raw = buf.slice(0, sep)
          buf = buf.slice(sep + 2)
          for (const line of raw.split('\n')) {
            if (!line.startsWith('data:')) continue
            const payload = line.slice(5).trim()
            if (payload.length === 0) continue
            try { frames.push(JSON.parse(payload)) } catch { /* keep-alive 注释帧等 */ }
          }
        }
      })
    },
  )
  req.end()
  return { frames, opened, close: () => req.destroy() }
}

/** wire 提交（浏览器上下文请求 = 真凭据随发）。 */
async function submitWire(page: Page, host: ExecutionHostHandle, opts: { submitId: string; text: string; workspaceId?: string }): Promise<ReturnType<typeof page.request.post>> {
  return page.request.post(`${host.baseUrl}/execution/turn.submit`, {
    data: {
      v: 0, id: crypto.randomUUID(), ts: Date.now(),
      type: 'turn.submit',
      bind: { workspaceId: opts.workspaceId ?? host.workspaceId, sessionId: 'short-0001' },
      payload: { submitId: opts.submitId, text: opts.text },
    },
  })
}

/** 磁盘证据：会话 JSONL 的 user 行数（引擎回合起点落盘形，R4 探针定谳）。 */
function userLineCount(host: ExecutionHostHandle): number {
  const lines = readFileSync(join(host.scopeDir, 'short-0001.jsonl'), 'utf8').split('\n').filter(l => l.trim().length > 0)
  return lines.filter(l => { try { return (JSON.parse(l) as { type?: unknown }).type === 'user' } catch { return false } }).length
}

/** 事件帧归一（控制帧展开；id/type/bind.turnId/cursor 抽取）。 */
function eventFrames(frames: unknown[]): Array<{ id: string; type: string; turnId: string | null; cursor: string | null }> {
  const out: Array<{ id: string; type: string; turnId: string | null; cursor: string | null }> = []
  for (const frame of frames) {
    const rec = frame as Record<string, unknown>
    if (rec.kind === 'baseline' || rec.kind === 'delta' || rec.kind === 'expired') {
      out.push(...eventFrames(Array.isArray(rec.events) ? rec.events : []))
      continue
    }
    if (typeof rec.type !== 'string') continue
    const bind = rec.bind as { turnId?: unknown } | undefined
    out.push({
      id: typeof rec.id === 'string' ? rec.id : '',
      type: rec.type,
      turnId: typeof bind?.turnId === 'string' ? bind.turnId : null,
      cursor: typeof rec.cursor === 'string' ? rec.cursor : null,
    })
  }
  return out
}

const TERMINALS = new Set(['turn.completed', 'turn.failed', 'turn.cancelled'])

async function waitFor(cond: () => boolean, ms: number, label: string): Promise<void> {
  const deadline = Date.now() + ms
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`timeout: ${label}`)
    await new Promise(r => setTimeout(r, 250))
  }
}

test('submit streams and persists a real turn', async ({ page }) => {
  const host = await launchInstalledBinExecution(installed)
  try {
    await openExecutionApp(page, host, host.workspaceId)
    const baseline = userLineCount(host)

    // UI 发送 → 引擎同回合：running 在场（turn.started 投影）。
    await page.locator('[data-exec-input]').fill(PONG_PROMPT)
    await page.locator('[data-exec-submit]').click()
    await expect(page.locator('[data-exec-running]')).toBeVisible({ timeout: 30_000 })

    // 真实增量落转录：引擎追加 JSONL → follow 投影送达（E6 腿前半）。
    await expect(page.locator('[data-transcript]')).toContainText('PONG', { timeout: 60_000 })

    // 终态恰一：队列排空（running 行消失）。
    await expect(page.locator('[data-exec-queue]')).toHaveCount(0, { timeout: 60_000 })

    // 磁盘证据：user 行 +1（引擎真跑，非 UI 假象）。
    expect(userLineCount(host)).toBe(baseline + 1)

    // 刷新回读（E6 后半）：同回合持久化可见。
    await page.reload()
    await expect(page.locator('[data-transcript]')).toContainText('PONG', { timeout: 30_000 })

    // E3 幂等：同 submitId 双 POST → 引擎侧恰一条 user 行（第二发零引擎执行）。
    const submitId = crypto.randomUUID()
    const first = await submitWire(page, host, { submitId, text: PONG_PROMPT })
    expect(first.status(), 'first submit accepted').toBe(200)
    const replay = await submitWire(page, host, { submitId, text: PONG_PROMPT })
    expect(replay.status(), 'idempotent replay also accepted').toBe(200)
    await waitFor(() => userLineCount(host) > baseline + 1, 60_000, 'idempotent turn to start')
    const afterStart = userLineCount(host)
    await waitFor(() => {
      const done = userLineCount(host)
      return done === afterStart && done === baseline + 2
    }, 60_000, 'idempotent turn to settle with exactly one user line')
    expect(userLineCount(host), 'same submitId must not produce a second turn (E3)').toBe(baseline + 2)
  } finally {
    host.close()
  }
})

test('unauthorized workspace never executes', async ({ page }) => {
  const host = await launchInstalledBinExecution(installed)
  try {
    await openExecutionApp(page, host, 'ws-unauthorized')
    const baseline = userLineCount(host)

    // wire 路径：未授权 workspace 提交被拒（E1 预校验，upstream 零触达）。
    const res = await submitWire(page, host, { submitId: crypto.randomUUID(), text: PONG_PROMPT, workspaceId: 'ws-unauthorized' })
    expect(res.status(), 'unauthorized submit must be rejected').toBe(403)

    // UI 路径：Composer 在场（probe 不查授权——连接级面），提交命令被服务端拒。
    await page.locator('[data-exec-input]').fill('Should never reach the engine.')
    await page.locator('[data-exec-submit]').click()
    await page.waitForTimeout(3000)

    // 内核证据口径：引擎零痕迹（JSONL 零新增 user 行、零 running 投影）。
    expect(userLineCount(host), 'engine must have zero trace of unauthorized submits').toBe(baseline)
    await expect(page.locator('[data-exec-running]')).toHaveCount(0)
    await expect(page.locator('[data-exec-queued]')).toHaveCount(0)
  } finally {
    host.close()
  }
})

test('queue cancel reaches the kernel with exactly one terminal', async ({ page }) => {
  const host = await launchInstalledBinExecution(installed)
  // 全程 SSE 旁路采集（runner 侧真流）：每 turnId 终态恰一是内核证据断言面。
  const cookie = await (async () => {
    await page.goto(host.redeemUrl)
    return cookieHeader(page, host)
  })()
  const sse = openExecutionSse(host, cookie, {})
  try {
    await sse.opened
    await openExecutionApp(page, host, host.workspaceId)

    // T1 运行中，T2 入队（并发 1 → FIFO）。
    await page.locator('[data-exec-input]').fill('Turn one: reply with the single word ONE.')
    await page.locator('[data-exec-submit]').click()
    await expect(page.locator('[data-exec-running]')).toBeVisible({ timeout: 30_000 })
    await page.locator('[data-exec-input]').fill('Turn two: reply with the single word TWO.')
    await page.locator('[data-exec-submit]').click()
    const queuedRow = page.locator('[data-exec-queued]').first()
    await expect(queuedRow).toBeVisible({ timeout: 30_000 })
    const t2 = await queuedRow.getAttribute('data-exec-queued')
    expect(t2).toBeTruthy()

    // 等待取消不启动：queued 移除 → cancelled 终态（不静默移除）。
    await page.locator(`[data-exec-remove="${t2}"]`).click()
    await expect(page.locator(`[data-exec-queued="${t2}"]`)).toHaveCount(0, { timeout: 30_000 })

    // T1 自然完成 → 队列排空。
    await expect(page.locator('[data-exec-queue]')).toHaveCount(0, { timeout: 90_000 })

    // 运行取消：T3 running → cancel → 恰一个终态（cancelled|completed 竞态容忍）。
    await page.locator('[data-exec-input]').fill('Turn three: reply with the single word THREE.')
    await page.locator('[data-exec-submit]').click()
    const runningRow = page.locator('[data-exec-running]').first()
    await expect(runningRow).toBeVisible({ timeout: 30_000 })
    const t3 = await runningRow.getAttribute('data-exec-running')
    await page.locator(`[data-exec-cancel="${t3}"]`).click()
    await expect(page.locator('[data-exec-queue]')).toHaveCount(0, { timeout: 90_000 })

    // 内核证据（SSE 旁路）：T2 无 started（等待取消不启动）；每 turnId 终态恰一。
    await waitFor(() => {
      const events = eventFrames(sse.frames)
      const terminals = events.filter(e => TERMINALS.has(e.type))
      return terminals.filter(e => e.turnId === t3).length >= 1
    }, 30_000, 'T3 terminal to reach the bypass stream')
    const events = eventFrames(sse.frames)
    const t2Events = events.filter(e => e.turnId === t2)
    expect(t2Events.some(e => e.type === 'turn.accepted'), 'T2 was accepted into the queue').toBe(true)
    expect(t2Events.some(e => e.type === 'turn.started'), 'cancelled-while-queued must never start').toBe(false)
    expect(t2Events.some(e => e.type === 'turn.cancelled'), 'T2 settles cancelled').toBe(true)
    const byTurn = new Map<string, string[]>()
    for (const e of events) {
      if (e.turnId === null || !TERMINALS.has(e.type)) continue
      byTurn.set(e.turnId, [...(byTurn.get(e.turnId) ?? []), e.type])
    }
    for (const [turnId, terminals] of byTurn) {
      expect(terminals.length, `turn ${turnId} settles with exactly one terminal`).toBe(1)
    }

    // 磁盘证据：T2 引擎零痕迹（从未启动 → 零 user 行）。
    const jsonl = readFileSync(join(host.scopeDir, 'short-0001.jsonl'), 'utf8')
    expect(jsonl).not.toContain('Turn two: reply with the single word TWO.')
  } finally {
    sse.close()
    host.close()
  }
})

test('decide with unknown approval is rejected without side effects', async ({ page }) => {
  const host = await launchInstalledBinExecution(installed)
  try {
    await openExecutionApp(page, host, host.workspaceId)
    const before = readFileSync(join(host.scopeDir, 'short-0001.jsonl'), 'utf8')

    // 未知 approvalId decide（bind 含 turnId）：kernel 拒（notFound 族）零副作用。
    const res = await page.request.post(`${host.baseUrl}/execution/approval.decide`, {
      data: {
        v: 0, id: crypto.randomUUID(), ts: Date.now(),
        type: 'approval.decide',
        bind: { workspaceId: host.workspaceId, sessionId: 'short-0001', turnId: 'turn-e2e-fake' },
        payload: { approvalId: 'ap-e2e-nonexistent', decision: 'approved' },
      },
    })
    expect([403, 404], 'unknown approvalId must be rejected').toContain(res.status())
    expect(readFileSync(join(host.scopeDir, 'short-0001.jsonl'), 'utf8'), 'zero side effects on the engine store').toBe(before)
  } finally {
    host.close()
  }
})

test('execution stream reconnects exactly once', async ({ page }) => {
  const host = await launchInstalledBinExecution(installed)
  try {
    await page.goto(host.redeemUrl)
    const cookie = await cookieHeader(page, host)

    // 连接 A：收首帧（replay baseline control）→ 记 cursor → 提交回合 →
    // 收到 accepted 证据 → 真 destroy（断连发生在回合中途）。
    const a = openExecutionSse(host, cookie, {})
    await a.opened
    await waitFor(() => a.frames.length >= 1, 10_000, 'control first frame')
    const control = a.frames[0] as { kind?: string; headCursor?: string }
    expect(control.kind, 'first frame is the replay control frame').toBe('baseline')

    const submitId = crypto.randomUUID()
    const res = await submitWire(page, host, { submitId, text: PONG_PROMPT })
    expect(res.status()).toBe(200)
    await waitFor(() => eventFrames(a.frames).some(e => e.type === 'turn.accepted'), 30_000, 'accepted to reach connection A')
    const aEvents = eventFrames(a.frames)
    const turnId = aEvents.find(e => e.type === 'turn.accepted')!.turnId
    expect(turnId).toBeTruthy()
    const lastCursor = aEvents.filter(e => e.cursor !== null).at(-1)!.cursor!
    a.close() // 真断连（回合仍在跑）

    // 断连期：回合自然完成（引擎侧磁盘证据）。
    const baseline = userLineCount(host)
    await waitFor(() => userLineCount(host) > baseline, 60_000, 'turn to persist while disconnected')

    // 连接 B：cursor 续传 → 断连期事件各恰好一次（A∪B = 全集、A∩B = ∅）。
    const b = openExecutionSse(host, cookie, { cursor: lastCursor })
    await b.opened
    await waitFor(() => {
      const events = eventFrames(b.frames)
      return events.some(e => e.turnId === turnId && TERMINALS.has(e.type))
    }, 30_000, 'terminal to reach resumed connection')
    b.close()

    const bEvents = eventFrames(b.frames).filter(e => e.turnId === turnId)
    const aTurn = aEvents.filter(e => e.turnId === turnId)
    const allIds = [...aTurn, ...bEvents].map(e => e.id)
    expect(new Set(allIds).size, 'every event delivered exactly once across the reconnect (no dupes)').toBe(allIds.length)
    const types = [...aTurn, ...bEvents].map(e => e.type)
    expect(types.filter(t => t === 'turn.accepted').length).toBe(1)
    expect(types.filter(t => t === 'turn.started').length).toBe(1)
    expect(types.filter(t => TERMINALS.has(t)).length, 'exactly one terminal').toBe(1)
    expect(types.some(t => t === 'turn.delta'), 'real deltas streamed').toBe(true)
    // B 不重放 A 已交付事件：accepted 只在 A 侧（cursor 严格续传）。
    expect(aTurn.some(e => e.type === 'turn.accepted'), 'accepted delivered pre-disconnect').toBe(true)
    expect(bEvents.some(e => e.type === 'turn.accepted'), 'resumed stream must not replay accepted').toBe(false)
  } finally {
    host.close()
  }
})
