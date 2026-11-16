import { describe, expect, test } from 'bun:test'

// e2e P1 三发现处置腿：
// ① SIGTERM with 活跃 follow 流 → 有界退出（shutdown 序：先 sessionHost.close()
//    终止订阅 → 泵自然终流 → server.close 可完成；closeAllConnections 兜底）。
// ③ resumeCursor 经 HTTP 透传（?cursor=）：未知 cursor → 上游契约显式
//    resetRequired（新 baseline 重入），非静默续接非 corruptData。
import { spawn } from 'node:child_process'
import { request } from 'node:http'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CLI = join(import.meta.dir, '..', 'src', 'launchCli.ts')

function getSse(base: string, path: string, cookie: string): Promise<{ res: import('node:http').IncomingMessage; events: string[]; done: Promise<void> }> {
  return new Promise((resolve, reject) => {
    const events: string[] = []
    const req = request(`${base}${path}`, { headers: { host: new URL(base).host, cookie: `atlas_session=${cookie}`, accept: 'text/event-stream' } }, res => {
      let buf = ''
      let resolveDone: () => void = () => {}
      const done = new Promise<void>(r => { resolveDone = r })
      res.on('data', (d: Buffer) => {
        buf += d.toString()
        let idx: number
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, idx)
          buf = buf.slice(idx + 2)
          const line = frame.split('\n').find(l => l.startsWith('data: '))
          if (line) events.push(line.slice(6))
        }
      })
      res.on('end', resolveDone)
      resolve({ res, events, done })
    })
    req.on('error', reject)
    req.end()
  })
}

function parseReady(stdout: string): { port: number; token: string } {
  const line = stdout.split('\n').find(l => l.trim().startsWith('{'))
  if (!line) throw new Error(`no ready line: ${stdout}`)
  const j = JSON.parse(line) as { ready: boolean; port: number; token: string }
  return { port: j.port, token: j.token }
}

async function waitReady(stdout: () => string): Promise<{ port: number; token: string }> {
  for (let i = 0; i < 100; i++) {
    if (stdout().includes('"ready"')) return parseReady(stdout())
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error('no ready line')
}

const userLine = (uuid: string, parentUuid: string | null, text: string, ts: string) =>
  JSON.stringify({ type: 'user', uuid, parentUuid, timestamp: ts, message: { role: 'user', content: text } })

describe('e2e findings: ① SIGTERM bounded exit with open stream / ③ cursor passthrough', () => {
  test('① SIGTERM with active follow stream exits bounded (no hang)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'atlasweb-f1-'))
    writeFileSync(join(dir, 's.jsonl'), userLine('u1', null, 'hi', '2026-11-16T08:00:00.000Z') + '\n')
    let out = ''
    const child = spawn('bun', [CLI, '--port', '0', '--scope', `main=${dir}`], { stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.on('data', (d: Buffer) => { out += d.toString() })
    try {
      const { port, token } = await waitReady(() => out)
      const base = `http://127.0.0.1:${port}`
      const redeem = await fetch(`${base}/auth/redeem?token=${encodeURIComponent(token)}`, { headers: { host: `127.0.0.1:${port}` } })
      const cookie = /atlas_session=([^;]+)/.exec(redeem.headers.get('set-cookie') ?? '')![1]!
      // 活跃 follow 流保持打开
      const stream = await getSse(base, '/sessions/s/follow?scopeId=main', cookie)
      const first = await (async () => {
        for (let i = 0; i < 50; i++) {
          if (stream.events.length > 0) return stream.events[0]!
          await new Promise(r => setTimeout(r, 100))
        }
        throw new Error('no baseline')
      })()
      expect((JSON.parse(first) as { kind: string }).kind).toBe('baseline')
      // SIGTERM：必须在 3s 内退出（挂死形 = 超时）
      const exited = new Promise<number>(resolve => child.once('exit', c => resolve(c ?? -1)))
      child.kill('SIGTERM')
      const code = await Promise.race([exited, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('process hung after SIGTERM with open follow stream')), 3000))])
      expect([0, 143]).toContain(code)
      stream.res.destroy()
    } finally {
      child.kill('SIGKILL')
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('③ ?cursor= passthrough seam: upstream gap — resumeCursor contract-present/implementation-absent (registered)', async () => {
    const { createHttpHost } = await import('../src/httpHost')
    const { createSessionHost } = await import('../src/sessionHost')
    const { createLaunchAuth } = await import('../src/auth')
    const dir = mkdtempSync(join(tmpdir(), 'atlasweb-f3-'))
    try {
      writeFileSync(join(dir, 's.jsonl'), userLine('u1', null, 'hi', '2026-11-16T08:00:00.000Z') + '\n')
      const sessionHost = createSessionHost({ productId: 'atlascode', scopes: [{ scopeId: 'main', storageDir: dir }] })
      const auth = createLaunchAuth({ secret: 'cursor-passthrough-secret-32-bytes!!!' })
      const { createServer } = await import('node:http')
      const server = createHttpHost({ sessionHost, auth })
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
      await sessionHost.start()
      try {
        const port = (server.address() as { port: number }).port
        const base = `http://127.0.0.1:${port}`
        const cookie = auth.redeemLaunchToken(auth.issueLaunchToken())!
        const stream = await getSse(base, `/sessions/s/follow?scopeId=main&cursor=${encodeURIComponent('bogus-cursor')}`, cookie)
        try {
          const first = await (async (): Promise<string> => {
            for (let i = 0; i < 50; i++) {
              if (stream.events.length > 0) return stream.events[0]!
              await new Promise(r => setTimeout(r, 100))
            }
            throw new Error('no event')
          })()
          const kind = (JSON.parse(first) as { kind: string }).kind
          // 上游缺口登记（2026-11-16，e2e 发现③定谳）：FollowSessionRequest.resumeCursor
          // 契约面在（readonlyRuntime.d.ts:92-96）但 runtime 零消费（index.js /
          // follow.d.ts 全无 resume 接线）——任意 cursor 一律 fresh baseline。
          // 当前可观测行为 = baseline（非 resetRequired 非 corruptData）；
          // 恢复语义候上游 S0-R5 波（与发现② rewrite 增量读缺口同域）。
          // 我侧 ?cursor= 透传缝已就位，上游落地即生效。
          expect(kind).toBe('baseline')
        } finally {
          stream.res.destroy()
          await Promise.race([stream.done, new Promise(r => setTimeout(r, 300))]) // destroy 后 'end' 未必触发——有界等待
        }
      } finally {
        await new Promise<void>(r => server.close(() => r()))
        await sessionHost.close()
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
