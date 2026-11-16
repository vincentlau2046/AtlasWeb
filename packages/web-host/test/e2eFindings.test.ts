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

  test('③ ?cursor= bogus → explicit fail-arm (cursorExpired error or resetRequired), never silent baseline replay', async () => {
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
          // S0-R5 @0.1.121 采纳后契约：未知/过期 cursor 必须走显式 fail-arm——
          // error{cursorExpired} 或 resetRequired（消费侧重入 fresh follow）；
          // 禁静默 fresh baseline 重放（0.1.119 旧行为：任意 cursor 一律 baseline）、
          // 禁 error{corruptData} 硬终端。
          const first = await (async (): Promise<string> => {
            for (let i = 0; i < 50; i++) {
              if (stream.events.length > 0) return stream.events[0]!
              await new Promise(r => setTimeout(r, 100))
            }
            throw new Error('no event')
          })()
          const parsed = stream.events.map(e => JSON.parse(e) as { kind: string; error?: { code?: string } })
          const failArm = parsed.some(e => e.kind === 'resetRequired' || (e.kind === 'error' && e.error?.code === 'cursorExpired'))
          expect(failArm, `first event kind=${(JSON.parse(first) as { kind: string }).kind}`).toBe(true)
          expect(parsed.some(e => e.error?.code === 'corruptData')).toBe(false)
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

  test('③b valid resumeCursor → zero-replay continuation (cursor from baseline, no baseline resend, new appends flow)', async () => {
    const { createHttpHost } = await import('../src/httpHost')
    const { createSessionHost } = await import('../src/sessionHost')
    const { createLaunchAuth } = await import('../src/auth')
    const dir = mkdtempSync(join(tmpdir(), 'atlasweb-f3b-'))
    try {
      writeFileSync(join(dir, 's.jsonl'), userLine('u1', null, 'hi', '2026-11-16T08:00:00.000Z') + '\n')
      const sessionHost = createSessionHost({ productId: 'atlascode', scopes: [{ scopeId: 'main', storageDir: dir }] })
      const auth = createLaunchAuth({ secret: 'cursor-resume-secret-32-bytes!!!!!!' })
      const { createServer } = await import('node:http')
      const server = createHttpHost({ sessionHost, auth })
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
      await sessionHost.start()
      try {
        const port = (server.address() as { port: number }).port
        const base = `http://127.0.0.1:${port}`
        const cookie = auth.redeemLaunchToken(auth.issueLaunchToken())!
        // 第一段：follow → baseline（携带 cursor）→ append u2 → replacement（更新 cursor）→ 断开
        const s1 = await getSse(base, '/sessions/s/follow?scopeId=main', cookie)
        try {
          const until = async (pred: (k: { kind: string; cursor?: string; projection?: { messages?: unknown[] } }) => boolean, ms: number) => {
            for (let i = 0; i < ms / 100; i++) {
              const hit = s1.events.map(e => JSON.parse(e) as { kind: string; cursor?: string; projection?: { messages?: unknown[] } }).find(pred)
              if (hit) return hit
              await new Promise(r => setTimeout(r, 100))
            }
            throw new Error('condition not met')
          }
          const baseline = await until(e => e.kind === 'baseline', 5000)
          expect(baseline.cursor).toBeTruthy()
          writeFileSync(join(dir, 's.jsonl'),
            userLine('u1', null, 'hi', '2026-11-16T08:00:00.000Z') + '\n' +
            userLine('u2', 'u1', 'again', '2026-11-16T08:00:01.000Z') + '\n')
          const replacement = await until(e => e.kind === 'replacement', 8000)
          expect(replacement.cursor).toBeTruthy()
          const resumeCursor = replacement.cursor!
          s1.res.destroy()
          await Promise.race([s1.done, new Promise(r => setTimeout(r, 300))])
          // 第二段：?cursor= 续接——零重放（无 baseline 重发），append u3 → 续流事件含 u3
          const s2 = await getSse(base, `/sessions/s/follow?scopeId=main&cursor=${encodeURIComponent(resumeCursor)}`, cookie)
          try {
            writeFileSync(join(dir, 's.jsonl'),
              userLine('u1', null, 'hi', '2026-11-16T08:00:00.000Z') + '\n' +
              userLine('u2', 'u1', 'again', '2026-11-16T08:00:01.000Z') + '\n' +
              userLine('u3', 'u2', 'third', '2026-11-16T08:00:02.000Z') + '\n')
            for (let i = 0; i < 80; i++) {
              const parsed = s2.events.map(e => JSON.parse(e) as { kind: string; projection?: { messages?: Array<{ blocks?: Array<{ text?: string }> }> } })
              const replayed = parsed.find(e => e.kind === 'baseline')
              expect(replayed, `zero-replay violated: baseline resent on valid resume; events=${s2.events.length ? s2.events.map(e => (JSON.parse(e) as { kind: string }).kind).join(',') : '(none)'}`).toBeUndefined()
              const continued = parsed.find(e => (e.kind === 'replacement' || e.kind === 'baseline') && JSON.stringify(e.projection).includes('third'))
              if (continued) break
              await new Promise(r => setTimeout(r, 100))
              if (i === 79) throw new Error('no continuation event containing u3 after resume')
            }
          } finally {
            s2.res.destroy()
            await Promise.race([s2.done, new Promise(r => setTimeout(r, 300))])
          }
        } finally {
          if (!s1.res.destroyed) s1.res.destroy()
        }
      } finally {
        await new Promise<void>(r => server.close(() => r()))
        await sessionHost.close()
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 30000)

  test('⑥-A rewrite-larger mid-subscription → resample fail-arm (resetRequired), never error{corruptData}', async () => {
    const { createHttpHost } = await import('../src/httpHost')
    const { createSessionHost } = await import('../src/sessionHost')
    const { createLaunchAuth } = await import('../src/auth')
    const dir = mkdtempSync(join(tmpdir(), 'atlasweb-f6a-'))
    try {
      writeFileSync(join(dir, 's.jsonl'), userLine('u1', null, 'hi', '2026-11-16T08:00:00.000Z') + '\n')
      const sessionHost = createSessionHost({ productId: 'atlascode', scopes: [{ scopeId: 'main', storageDir: dir }] })
      const auth = createLaunchAuth({ secret: 'rewrite-larger-secret-32-bytes!!!!!' })
      const { createServer } = await import('node:http')
      const server = createHttpHost({ sessionHost, auth })
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
      await sessionHost.start()
      try {
        const port = (server.address() as { port: number }).port
        const base = `http://127.0.0.1:${port}`
        const cookie = auth.redeemLaunchToken(auth.issueLaunchToken())!
        const stream = await getSse(base, '/sessions/s/follow?scopeId=main', cookie)
        try {
          // 等 baseline
          for (let i = 0; i < 50; i++) {
            if (stream.events.some(e => (JSON.parse(e) as { kind: string }).kind === 'baseline')) break
            await new Promise(r => setTimeout(r, 100))
          }
          expect(stream.events.some(e => (JSON.parse(e) as { kind: string }).kind === 'baseline')).toBe(true)
          // 同 inode 重写放大（writeFileSync 截断重写，size 越过已发 byteOffset；
          // 0.1.119 缺陷②：guard 漏 same-inode size>offset → 增量读损坏 → corruptData）
          writeFileSync(join(dir, 's.jsonl'),
            userLine('u1', null, 'hi-rewritten', '2026-11-16T08:00:00.000Z') + '\n' +
            userLine('u2', 'u1', 'bigger', '2026-11-16T08:00:01.000Z') + '\n')
          // S0-R5 (c) 重采样兜底：rewrite 检测 → 显式 resetRequired（消费侧重入）
          // 或流内重采样新 baseline；禁 corruptData 硬终端。
          let resolved = false
          for (let i = 0; i < 80; i++) {
            const parsed = stream.events.map(e => JSON.parse(e) as { kind: string; error?: { code?: string } })
            if (parsed.some(e => e.kind === 'resetRequired' || e.error?.code === 'corruptData' || (e.kind === 'baseline' && JSON.stringify(e).includes('rewritten')))) {
              resolved = true
              expect(parsed.some(e => e.error?.code === 'corruptData'), 'corruptData must be gone under resample fix').toBe(false)
              break
            }
            await new Promise(r => setTimeout(r, 100))
          }
          expect(resolved, 'no resample fail-arm within 8s of rewrite-larger').toBe(true)
        } finally {
          stream.res.destroy()
          await Promise.race([stream.done, new Promise(r => setTimeout(r, 300))])
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
