import { describe, expect, test } from 'bun:test'
import { launchHost, makeSeedDir, rmDir, redeemForCookie, cookieHeaderValue } from './helpers'
import { request } from 'node:http'

// E2E-05 客户端断开 → 订阅槽释放（计划 v1 P1）。
// 判别面纪律（F4 注记 / followStream.test.ts 腿a 形 / 探针 2026-11-16）：
// RST 对零读对端事件级不可观测 → 可移植判别面 = 重连同 session 得新订阅。
// 本腿用「多轮 连接→读 baseline→断开→重连」循环：若断开不释放槽，
// 默认 maxSubscriptions 配额最终以 resourceLimit(429) 显形。

const HOST = '127.0.0.1'

function openFollow(port: number, headers: Record<string, string>): Promise<import('node:http').IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = request({ host: HOST, port, path: '/sessions/static/follow?scopeId=main', headers }, res => resolve(res))
    req.on('error', reject)
    req.end()
  })
}

async function readFirstDataFrame(res: import('node:http').IncomingMessage, timeoutMs = 5000): Promise<string> {
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no SSE data within timeout')), timeoutMs)
    res.once('data', (d: Buffer) => {
      clearTimeout(timer)
      resolve(d.toString())
    })
  })
}

let host: Awaited<ReturnType<typeof launchHost>>
let dir: string
let cookie: string

describe('E2E-05 disconnect frees subscription slot (reconnect-based observation)', () => {
  test('setup: launch + redeem', async () => {
    dir = makeSeedDir('atlasweb-e2e05-', {
      'static': [
        { type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2026-11-16T08:00:00.000Z', message: { role: 'user', content: 'hi' } },
      ],
    })
    host = await launchHost({ scopes: [{ id: 'main', dir }] })
    cookie = cookieHeaderValue(await redeemForCookie(host.port, host.token))
  }, 30000)

  test('5× connect→baseline→destroy→wait→reconnect cycles all succeed (no slot exhaustion)', async () => {
    for (let cycle = 1; cycle <= 5; cycle++) {
      const res = await openFollow(host.port, { cookie })
      expect(res.statusCode, `cycle ${cycle}: follow must succeed (leaked slots would surface as 429)`).toBe(200)
      const first = await readFirstDataFrame(res)
      expect(first).toContain('"kind":"baseline"')
      // 客户端硬断开（静态会话永不再产事件 → 清理不得依赖下一事件）
      res.destroy()
      // 服务端清理窗口
      await new Promise(r => setTimeout(r, 250))
    }
    // 循环后仍可建新订阅
    const res = await openFollow(host.port, { cookie })
    expect(res.statusCode).toBe(200)
    res.destroy()
  }, 60000)

  test('teardown', async () => {
    const code = await host.stop()
    expect(code).toBe(0)
    rmDir(dir)
  }, 30000)
})
