import { describe, expect, test } from 'bun:test'

// 启动入口 seam（裁定 ③，E2E-01/02 锚定面）：
// spawn `bun packages/web-host/src/launchCli.ts --port 0 --secret … --scope id=dir`
// → stdout 恰一行 JSON {ready:true, port, token} → 该 token 经
// GET /auth/redeem 兑换 cookie → /sessions 200（父进程零直造 cookie）；
// SIGTERM → 优雅退出（exit code 0/143 视关闭竞态，端口释放）。
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CLI = join(import.meta.dir, '..', 'src', 'launchCli.ts')

describe('launchCli seam (E2E-01/02 anchor)', () => {
  test('spawn → ready line {ready,port,token} → redeem chain → SIGTERM graceful', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'atlasweb-cli-'))
    writeFileSync(join(dir, 's1.jsonl'), JSON.stringify({ type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2026-11-16T08:00:00.000Z', message: { role: 'user', content: 'cli smoke' } }) + '\n')
    const child = spawn('bun', [CLI, '--port', '0', '--secret', 'launch-cli-smoke-secret-32-bytes!!!', '--scope', `main=${dir}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    try {
      // ready 行（单行 JSON）
      const readyLine = await (async (): Promise<Record<string, unknown>> => {
        for (let i = 0; i < 100; i++) {
          const line = stdout.split('\n').find(l => l.trim().startsWith('{'))
          if (line) return JSON.parse(line) as Record<string, unknown>
          await new Promise(r => setTimeout(r, 100))
        }
        throw new Error(`no ready line; stdout=${stdout} stderr=${stderr}`)
      })()
      expect(readyLine['ready']).toBe(true)
      expect(typeof readyLine['port']).toBe('number')
      expect(typeof readyLine['token']).toBe('string')
      const port = readyLine['port'] as number
      const base = `http://127.0.0.1:${port}`
      // token→cookie 全链（父进程不直造 cookie）
      const redeem = await fetch(`${base}/auth/redeem?token=${encodeURIComponent(readyLine['token'] as string)}`, { headers: { host: `127.0.0.1:${port}` } })
      expect(redeem.status).toBe(200)
      const cookie = /atlas_session=([^;]+)/.exec(redeem.headers.get('set-cookie') ?? '')![1]!
      const list = await fetch(`${base}/sessions?scopeId=main`, { headers: { host: `127.0.0.1:${port}`, cookie: `atlas_session=${cookie}` } })
      expect(list.status).toBe(200)
      const listBody = await list.json() as { sessions: Array<{ sessionId: string }> }
      expect(listBody.sessions.map(s => s.sessionId)).toContain('s1')
      // SIGTERM 优雅退出 + 端口释放
      const exited = new Promise<number>(resolve => child.once('exit', code => resolve(code ?? -1)))
      child.kill('SIGTERM')
      const code = await Promise.race([exited, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('no exit after SIGTERM')), 5000))])
      expect([0, 143]).toContain(code)
    } finally {
      child.kill('SIGKILL')
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('CWE-214: no --secret → ephemeral in-process secret, zero argv exposure', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'atlasweb-cli2-'))
    const child = spawn('bun', [CLI, '--port', '0', '--scope', `main=${dir}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    try {
      const readyLine = await (async (): Promise<Record<string, unknown>> => {
        for (let i = 0; i < 100; i++) {
          const line = stdout.split('\n').find(l => l.trim().startsWith('{'))
          if (line) return JSON.parse(line) as Record<string, unknown>
          await new Promise(r => setTimeout(r, 100))
        }
        throw new Error(`no ready line; stdout=${stdout} stderr=${stderr}`)
      })()
      expect(readyLine['ready']).toBe(true)
      const port = readyLine['port'] as number
      // token→cookie 全链照常（secret 对客户端永不可见）
      const redeem = await fetch(`http://127.0.0.1:${port}/auth/redeem?token=${encodeURIComponent(readyLine['token'] as string)}`, { headers: { host: `127.0.0.1:${port}` } })
      expect(redeem.status).toBe(200)
    } finally {
      child.kill('SIGKILL')
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('--session-ttl-ms: short ttl → cookie expires → 401 (E2E-02 过期腿 seam)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'atlasweb-cli3-'))
    const child = spawn('bun', [CLI, '--port', '0', '--session-ttl-ms', '150', '--scope', `main=${dir}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    try {
      const readyLine = await (async (): Promise<Record<string, unknown>> => {
        for (let i = 0; i < 100; i++) {
          const line = stdout.split('\n').find(l => l.trim().startsWith('{'))
          if (line) return JSON.parse(line) as Record<string, unknown>
          await new Promise(r => setTimeout(r, 100))
        }
        throw new Error(`no ready line; stdout=${stdout} stderr=${stderr}`)
      })()
      const port = readyLine['port'] as number
      const redeem = await fetch(`http://127.0.0.1:${port}/auth/redeem?token=${encodeURIComponent(readyLine['token'] as string)}`, { headers: { host: `127.0.0.1:${port}` } })
      expect(redeem.status).toBe(200)
      const cookie = /atlas_session=([^;]+)/.exec(redeem.headers.get('set-cookie') ?? '')![1]!
      // ttl 内有效
      const fresh = await fetch(`http://127.0.0.1:${port}/sessions`, { headers: { host: `127.0.0.1:${port}`, cookie: `atlas_session=${cookie}` } })
      expect(fresh.status).toBe(200)
      // 过期后 → 401
      await new Promise(r => setTimeout(r, 400))
      const expired = await fetch(`http://127.0.0.1:${port}/sessions`, { headers: { host: `127.0.0.1:${port}`, cookie: `atlas_session=${cookie}` } })
      expect(expired.status).toBe(401)
    } finally {
      child.kill('SIGKILL')
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
