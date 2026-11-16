import { describe, expect, test } from 'bun:test'
import { launchHost, makeSeedDir, rmDir, httpRequest, redeemForCookie, cookieHeaderValue } from './helpers'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { request } from 'node:http'
import { sseReader } from './e2e-04-follow-convergence.test'

// E2E-06 truncate/rewrite → resetRequired → 新 baseline → 终收敛（计划 v1 P1）。
// 行为探针定谳（2026-11-16，真实进程 + 0.1.119 runtime）：
// - rewrite 成【更小】文件（compact/截断形）→ resetRequired（"file replaced
//   or truncated (identity discontinuity)"）→ 同流内全新 baseline（新
//   baselineId、revision 0）→ 新域追加 → replacement 收敛。本文件钉此形态。
// -【登记缺陷 ⑥-A】rewrite 成【更大】文件 → error{corruptData
//   "unparseable complete record"} → closed 终态。机制：增量读取持旧 offset，
//   新文件更大时旧 offset 之后仍有字节 → 解析命中半行垃圾 → 身份不连续被
//   误判为数据损坏并硬终流。按 S0 总约 §4，replace 应走 resetRequired 路径。
//   已报 F4（上游 runtime 增量读 + inode 变更路径）；修复后补 grow-rewrite 腿。
// -【登记缺口——cursor 恢复腿暂不可达】上游 FollowSessionRequest 支持
//   resumeCursor（kernel/protocol/webSessionV0.d.ts），但 HTTP 桥
//   （sessionHost.followSession）未透出 cursor 参数 → 「断线后携旧 cursor
//   重入 → resetRequired」无法经 HTTP 驱动。已报 F4，seam 落地后补腿。
// - 订阅建立窗口内（首个轮询周期前）的任何 rewrite 同样呈 corruptData 形
//   （探针 2026-11-16）；本测试 settle 1.6s 避开建立窗口。

const HOST = '127.0.0.1'

function openFollow(port: number, headers: Record<string, string>): Promise<import('node:http').IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = request({ host: HOST, port, path: '/sessions/sess-1/follow?scopeId=main', headers }, res => resolve(res))
    req.on('error', reject)
    req.end()
  })
}

let host: Awaited<ReturnType<typeof launchHost>>
let dir: string
let cookie: string

describe('E2E-06 rewrite(shrink) → resetRequired → re-baseline → convergence', () => {
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

  test('shrink rewrite → resetRequired(identity discontinuity) → fresh baseline → replacement converges', async () => {
    const res = await openFollow(host.port, { cookie })
    expect(res.statusCode).toBe(200)
    const reader = sseReader(res)

    const baseline = await reader.next()
    expect(baseline?.kind).toBe('baseline')
    expect(baseline!.projection.messages).toHaveLength(2)
    const oldBaselineId = baseline!.baselineId

    // 避开订阅建立窗口（探针定谳：首个轮询周期内的 rewrite 呈 corruptData 形）
    await new Promise(r => setTimeout(r, 1600))

    // 截断改写为更小文件（compact 形：丢弃 a1）
    writeFileSync(join(dir, 'sess-1.jsonl'), JSON.stringify({ type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2026-11-16T08:00:00.000Z', message: { role: 'user', content: 'hi' } }) + '\n')

    const reset = await reader.next()
    expect(reset?.kind).toBe('resetRequired')
    expect(String(reset!.reason)).toContain('identity discontinuity')

    // 同流内新 baseline：新域（baselineId 更换、revision 归零）、无旧域倒灌
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

  test('teardown', async () => {
    const code = await host.stop()
    expect(code).toBe(0)
    rmDir(dir)
  }, 30000)
})
