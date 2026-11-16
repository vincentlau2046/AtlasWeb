import { describe, expect, test } from 'bun:test'
import { launchHost, makeSeedDir, rmDir, httpRequest, redeemForCookie, cookieHeaderValue } from './helpers'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { request } from 'node:http'
import { sseReader } from './e2e-04-follow-convergence.test'

// E2E-06 truncate/rewrite → resetRequired → 新 baseline → 终收敛（计划 v1 P1）。
// 【S0-R5（0.1.121）翻转后终态 @3fc97a0，探针定谳 2026-11-16】：
// - ⑥-A closed：rewrite（shrink 或 grow 均同）→ resetRequired（"file replaced
//   or truncated (identity discontinuity)"）→ 同流内全新 baseline（新
//   baselineId、revision 0）→ 新域追加 → replacement 收敛。corruptData 必缺席
//   （原缺陷形 = grow 时半行垃圾误判，已由上游增量读修复）。
// - cursor 面（?cursor= 透传，resumeCursor 已被上游消费）：
//   - 合法 cursor → 零重放续接：无 baseline 重发（流先静默），追加 → replacement
//     续流（同域 revision 续计）；SSE 头由 res.flushHeaders() 即时冲刷（host
//     缺陷已修 @3fc97a0）。
//   - 未知/过期 cursor → 显式 fail-arm：resetRequired（"resume cursor
//     rejected (unknown)"）→ 重采样 baseline；禁静默 baseline 重放。
// - 订阅建立窗口内 rewrite：S0-R5 前呈 corruptData 形的时序窗已随同一修复闭
//   （grow/shrink 统一 resetRequired）；本文件仍 settle 1.6s 规避时序敏感。

const HOST = '127.0.0.1'

function openFollow(port: number, path: string, headers: Record<string, string>): Promise<import('node:http').IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = request({ host: HOST, port, path, headers }, res => resolve(res))
    req.on('error', reject)
    req.end()
  })
}

let host: Awaited<ReturnType<typeof launchHost>>
let dir: string
let cookie: string

describe('E2E-06 rewrite → resetRequired → re-baseline → convergence (S0-R5 flipped)', () => {
  test('setup: launch + redeem', async () => {
    dir = makeSeedDir('atlasweb-e2e06-', {
      'sess-1': [
        { type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2026-11-16T08:00:00.000Z', message: { role: 'user', content: 'hi' } },
        { type: 'assistant', uuid: 'a1', parentUuid: 'u1', timestamp: '2026-11-16T08:00:01.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'hello' }] } },
      ],
    })
    host = await launchHost({ scopes: [{ id: 'main', dir }] })
    cookie = cookieHeaderValue(await redeemForCookie(host.port, host.token))
  }, 30000)

  test('⑥-A flipped: GROW-rewrite → resetRequired(identity discontinuity) → re-baseline; corruptData absent', async () => {
    const res = await openFollow(host.port, '/sessions/sess-1/follow?scopeId=main', { cookie })
    expect(res.statusCode).toBe(200)
    const reader = sseReader(res)

    const baseline = await reader.next()
    expect(baseline?.kind).toBe('baseline')
    const oldBaselineId = baseline!.baselineId

    await new Promise(r => setTimeout(r, 1600))

    // 改写为【更大】文件（原缺陷形：grow 时 corruptData 硬终流）
    writeFileSync(join(dir, 'sess-1.jsonl'), [
      JSON.stringify({ type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2026-11-16T08:00:00.000Z', message: { role: 'user', content: 'hi' } }),
      JSON.stringify({ type: 'assistant', uuid: 'a1', parentUuid: 'u1', timestamp: '2026-11-16T08:00:01.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'REWRITTEN-LONGER-TEXT' }] } }),
    ].join('\n') + '\n')

    const reset = await reader.next()
    expect(reset?.kind, `expected resetRequired, got ${JSON.stringify(reset)}`).toBe('resetRequired')
    // S0-R5 grow 形走重采样路径，reason 形态与 shrink 的 identity
    // discontinuity 不同（探针定谳：'transcript rewritten (resample
    // prefix mismatch)'）；corruptData 必缺席已由 kind 断言承载
    expect(String(reset!.reason)).toMatch(/rewritten|identity discontinuity/)

    const rebaseline = await reader.next()
    expect(rebaseline?.kind).toBe('baseline')
    expect(rebaseline!.baselineId).not.toBe(oldBaselineId)
    expect(rebaseline!.revision).toBe(0)
    res.destroy()
  }, 30000)

  test('shrink-rewrite → resetRequired → re-baseline → replacement converges with disk', async () => {
    const res = await openFollow(host.port, '/sessions/sess-1/follow?scopeId=main', { cookie })
    expect(res.statusCode).toBe(200)
    const reader = sseReader(res)

    const baseline = await reader.next()
    expect(baseline?.kind).toBe('baseline')
    const oldBaselineId = baseline!.baselineId

    await new Promise(r => setTimeout(r, 1600))

    // 截断改写为更小文件（compact 形）
    writeFileSync(join(dir, 'sess-1.jsonl'), JSON.stringify({ type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2026-11-16T08:00:00.000Z', message: { role: 'user', content: 'hi' } }) + '\n')

    const reset = await reader.next()
    expect(reset?.kind).toBe('resetRequired')
    expect(String(reset!.reason)).toContain('identity discontinuity')

    const rebaseline = await reader.next()
    expect(rebaseline?.kind).toBe('baseline')
    expect(rebaseline!.baselineId).not.toBe(oldBaselineId)
    expect(rebaseline!.revision).toBe(0)
    expect(rebaseline!.projection.messages).toHaveLength(1)

    // 新域追加 → replacement 收敛，投影 = 磁盘 replay 真值
    writeFileSync(join(dir, 'sess-1.jsonl'), [
      JSON.stringify({ type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2026-11-16T08:00:00.000Z', message: { role: 'user', content: 'hi' } }),
      JSON.stringify({ type: 'user', uuid: 'u3', parentUuid: 'u1', timestamp: '2026-11-16T08:00:09.000Z', message: { role: 'user', content: 'post-rewrite' } }),
    ].join('\n') + '\n')
    const replacement = await reader.next()
    expect(replacement?.kind).toBe('replacement')
    expect(replacement!.baselineId).toBe(rebaseline!.baselineId)
    expect(replacement!.projection.messages).toHaveLength(2)

    const rep = await httpRequest(host.port, '/sessions/sess-1/replay?scopeId=main', { headers: { cookie } })
    const diskProjection = (JSON.parse(rep.body) as { projection: { messages: unknown[] } }).projection
    expect(replacement!.projection.messages).toEqual(diskProjection.messages)
    res.destroy()
  }, 30000)

  test('E2E-06b flipped: valid resumeCursor → zero-replay continuation (no baseline re-emit)', async () => {
    const res1 = await openFollow(host.port, '/sessions/sess-1/follow?scopeId=main', { cookie })
    const reader1 = sseReader(res1)
    const baseline1 = await reader1.next()
    expect(baseline1?.kind).toBe('baseline')
    const cursor = String(baseline1!.cursor)
    res1.destroy()

    // resume：头即时冲刷（flushHeaders 修复腿——openFollow 在 response 事件
    // 即 resolve，若悬挂无头则此处超时 RED）
    const res2 = await openFollow(host.port, `/sessions/sess-1/follow?scopeId=main&cursor=${encodeURIComponent(cursor)}`, { cookie })
    expect(res2.statusCode).toBe(200)
    expect(res2.headers['content-type']).toContain('text/event-stream')
    const reader2 = sseReader(res2)

    // 零重放：400ms 内零 SSE 帧（旧缺陷形 = 静默 baseline 重放，此处 RED；
    // next 超时抛错 = 无早到帧，恰为预期）
    let early: unknown = null
    let earlyArrived = false
    try {
      early = await reader2.next(400)
      earlyArrived = early !== null
    } catch { /* next timeout = 零早到帧 */ }
    expect(earlyArrived, `zero-replay violated: got ${JSON.stringify(early)} before any append`).toBe(false)

    // 真追加（appendFileSync，前缀共享；writeFileSync 全量重写会被正确判为
    // rewrite → resetRequired——前序腿已改文件内容，此处挂当前链叶 u3）
    const { appendFileSync } = await import('node:fs')
    appendFileSync(join(dir, 'sess-1.jsonl'), JSON.stringify({ type: 'user', uuid: 'u4', parentUuid: 'u3', timestamp: '2026-11-16T08:00:11.000Z', message: { role: 'user', content: 'resumed' } }) + '\n')
    const next = await reader2.next()
    expect(next?.kind, `expected replacement continuation, got ${JSON.stringify(next)}`).toBe('replacement')
    expect(next!.revision).toBe(baseline1!.revision + 1)
    expect(next!.projection.messages).toHaveLength(3)
    res2.destroy()
  }, 30000)

  test('E2E-06b flipped: unknown cursor → explicit resetRequired fail-arm (no silent baseline replay)', async () => {
    const res = await openFollow(host.port, `/sessions/sess-1/follow?scopeId=main&cursor=${encodeURIComponent('00000000-0000-4000-8000-000000000000')}`, { cookie })
    expect(res.statusCode).toBe(200)
    const reader = sseReader(res)
    const first = await reader.next()
    // 显式 fail-arm：resetRequired（禁静默 baseline 重放）
    expect(first?.kind, `expected resetRequired fail-arm, got ${JSON.stringify(first)}`).toBe('resetRequired')
    expect(String(first!.reason)).toContain('resume cursor rejected')
    // 重采样兜底：新域 baseline
    const rebaseline = await reader.next()
    expect(rebaseline?.kind).toBe('baseline')
    res.destroy()
  }, 30000)

  test('teardown', async () => {
    const code = await host.stop()
    expect(code).toBe(0)
    rmDir(dir)
  }, 30000)
})
