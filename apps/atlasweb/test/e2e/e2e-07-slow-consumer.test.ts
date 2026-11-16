import { describe, expect, test } from 'bun:test'
import { launchHost, makeSeedDir, rmDir, redeemForCookie, cookieHeaderValue } from './helpers'
import { createConnection, type Socket } from 'node:net'

// E2E-07 慢消费者强断的客户端侧观测（计划 v1 P1，真实进程）。
// 形态（对齐 followStream.test.ts 腿b / 探针 2026-11-16 双运行时定谳）：
// - 裸 TCP 客户端连接后零读（真零窗口）→ 服务端 write()=false → 背压暂停
//   → slowConsumerMs 超限 → res.destroy() 强断（优雅 end 在零窗口下无限挂）。
// - RST 对零读对端事件级不可观测 → 客户端判别面：deadline 后恢复读，
//   强断形 = 连接在有限时间内终止（close/error）；挂住形（RED）= 连接
//   永不终止（服务端持续等事件）。
// - 强断后重连必须可用（订阅已被释放，非泄漏形）。
// 种子：3.5MiB 消息体——须低于默认 maxProjectionBytes = 4MiB（超限 →
// error{resourceLimit} → closed 快速终流，慢消费者形态根本不可达，探针
// 2026-11-16 定谳），又须高于 loopback 零读窗口（真背压）。
// --follow-slow-consumer-ms 500 注入短超时。
const HOST = '127.0.0.1'
const BIG = 'x'.repeat(3.5 * 1024 * 1024)

function rawFollow(port: number, cookie: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const sock = createConnection({ host: HOST, port }, () => {
      // cookie 已是完整 header 对（atlas_session=…），勿再拼前缀
      sock.write(`GET /sessions/big/follow?scopeId=main HTTP/1.1\r\nhost: ${HOST}:${port}\r\ncookie: ${cookie}\r\nconnection: close\r\n\r\n`)
      resolve(sock)
    })
    sock.once('error', reject)
  })
}

/** 真零读保持至 deadline（不挂 data 监听、不 resume —— 挂 'data' 即进入
 * flowing 模式，零窗口前提即失效），然后恢复读并等待连接终止 */
async function readUntilClosed(sock: Socket, deadlineMs: number, graceMs = 5000): Promise<{ closed: boolean; errCode?: string; bytesSeen: number; head: string }> {
  return await new Promise(resolve => {
    let bytesSeen = 0
    let head = ''
    let settled = false
    const done = (errCode?: string): void => {
      if (settled) return
      settled = true
      resolve({ closed: true, errCode, bytesSeen, head })
    }
    // 仅挂 close/error（不会触发 flowing）；deadline 前严格零读
    sock.on('close', () => done())
    sock.on('error', (e: Error) => done((e as NodeJS.ErrnoException).code))
    setTimeout(() => {
      // 恢复读：强断形下服务端已 destroy → close/error 将至；
      // 挂住形下数据流持续 → grace 超时判未终止。
      sock.on('data', (d: Buffer) => {
        bytesSeen += d.length
        if (head.length < 4096) head += d.toString()
      })
      sock.resume()
      const grace = setTimeout(() => {
        if (settled) return
        settled = true
        sock.destroy()
        resolve({ closed: false, bytesSeen, head })
      }, graceMs)
      grace.unref()
    }, deadlineMs).unref()
  })
}

let host: Awaited<ReturnType<typeof launchHost>>
let dir: string
let cookie: string

describe('E2E-07 slow consumer force-disconnect (client-side observation)', () => {
  test('setup: launch with short slow-consumer timeout + big seed + redeem', async () => {
    dir = makeSeedDir('atlasweb-e2e07-', {
      'big': [
        { type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2026-11-16T08:00:00.000Z', message: { role: 'user', content: BIG } },
      ],
    })
    host = await launchHost({
      scopes: [{ id: 'main', dir }],
      extraArgs: ['--follow-slow-consumer-ms', '500'],
    })
    cookie = cookieHeaderValue(await redeemForCookie(host.port, host.token))
  }, 60000)

  test('zero-read client: server force-terminates within deadline+grace; reconnect usable', async () => {
    const sock = await rawFollow(host.port, cookie)
    // deadline：500ms slowConsumerMs + 背压建立余量
    const outcome = await readUntilClosed(sock, 2500, 5000)
    // 防虚过：收到的必须是大体积 baseline 流（非 590B 的 error{resourceLimit}
    // 快速终流形——种子超投影上限时会出现该假阳性，探针 2026-11-16 定谳）
    expect(outcome.head).not.toContain('"kind":"error"')
    expect(outcome.bytesSeen).toBeGreaterThan(1024 * 1024)
    // 强断形：连接在有限时间终止（挂住形 = closed:false → RED）
    expect(outcome.closed, `server must force-terminate slow consumer (bytesSeen=${outcome.bytesSeen})`).toBe(true)

    // 强断后订阅已释放：新客户端（正常读）可重新 follow 得 baseline
    const sock2 = await rawFollow(host.port, cookie)
    const second = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('reconnect follow: no data')), 8000)
      let buf = ''
      sock2.on('data', (d: Buffer) => {
        buf += d.toString()
        if (buf.includes('"kind":"baseline"')) {
          clearTimeout(timer)
          resolve(buf)
        }
      })
      sock2.on('error', e => { clearTimeout(timer); reject(e) })
    })
    expect(second).toContain('"kind":"baseline"')
    sock2.destroy()
  }, 60000)

  test('teardown', async () => {
    const code = await host.stop()
    expect(code).toBe(0)
    rmDir(dir)
  }, 60000)
})
