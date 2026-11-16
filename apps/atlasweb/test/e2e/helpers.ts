/**
 * E2E helpers — 真实进程 spawn + 原始 node:http 客户端。
 *
 * 纪律（与 Atlasweb-F4 对齐 2026-11-16）：
 * - 客户端一律 node:http（bun fetch 急切缓冲 body，不可用于后续 SSE 背压类用例）；
 * - 鉴权走完整 launch token → GET /auth/redeem → cookie 兑换链，零直造 cookie；
 * - 就绪协议：launchCli stdout 恰一行 JSON {"ready":true,"port":n,"token":…}。
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { request } from 'node:http'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'

const LAUNCH_CLI = fileURLToPath(new URL('../../../../packages/web-host/src/launchCli.ts', import.meta.url))

export interface SeedLine {
  type: 'user' | 'assistant'
  uuid: string
  parentUuid: string | null
  timestamp: string
  message: { role: 'user' | 'assistant'; content: string | Array<{ type: 'text'; text: string }> }
}

export function makeSeedDir(prefix: string, sessions: Record<string, SeedLine[]>): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  for (const [name, lines] of Object.entries(sessions)) {
    writeFileSync(join(dir, `${name}.jsonl`), lines.map(l => JSON.stringify(l)).join('\n') + '\n')
  }
  return dir
}

export function rmDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
}

export interface HostHandle {
  proc: ChildProcess
  port: number
  token: string
  stderrTail: string
  /** SIGTERM 优雅关闭，resolve 进程退出码 */
  stop(): Promise<number | null>
}

export async function launchHost(opts: {
  scopes: Array<{ id: string; dir: string }>
  secret?: string
  port?: number
  extraArgs?: string[]
  readyTimeoutMs?: number
}): Promise<HostHandle> {
  const args = [
    LAUNCH_CLI,
    '--port', String(opts.port ?? 0),
    '--secret', opts.secret ?? 'e2e-launch-secret-32-bytes!!!!!!!!!',
    ...opts.scopes.flatMap(s => ['--scope', `${s.id}=${s.dir}`]),
    ...(opts.extraArgs ?? []),
  ]
  const proc = spawn('bun', args, { stdio: ['ignore', 'pipe', 'pipe'] })
  const stderrTail: string[] = []
  proc.stderr!.on('data', (d: Buffer) => {
    stderrTail.push(d.toString())
    if (stderrTail.length > 20) stderrTail.shift()
  })

  const ready = new Promise<{ port: number; token: string }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`launchCli ready timeout (stderr: ${stderrTail.join('')})`)), opts.readyTimeoutMs ?? 15000)
    const rl = createInterface({ input: proc.stdout! })
    rl.on('line', line => {
      const trimmed = line.trim()
      if (!trimmed.startsWith('{')) return
      try {
        const parsed = JSON.parse(trimmed) as { ready?: boolean; port?: number; token?: string }
        if (parsed.ready === true && typeof parsed.port === 'number' && typeof parsed.token === 'string') {
          clearTimeout(timer)
          rl.close()
          resolve({ port: parsed.port, token: parsed.token })
        }
      } catch { /* 非 JSON 行忽略（诊断行在 stderr） */ }
    })
    proc.once('exit', code => {
      clearTimeout(timer)
      reject(new Error(`launchCli exited before ready: code=${code} stderr=${stderrTail.join('')}`))
    })
  })

  const { port, token } = await ready
  return {
    proc,
    port,
    token,
    get stderrTail() { return stderrTail.join('') },
    stop() {
      return new Promise(resolve => {
        if (proc.exitCode !== null || proc.signalCode !== null) { resolve(proc.exitCode); return }
        proc.once('exit', code => resolve(code))
        proc.kill('SIGTERM')
        // 优雅关闭兜底：5s 后强杀
        setTimeout(() => { if (proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL') }, 5000).unref()
      })
    },
  }
}

export interface RawResponse {
  status: number
  headers: import('node:http').IncomingHttpHeaders
  body: string
}

/** 原始 node:http 客户端（E2E 全套件统一；禁止 bun fetch） */
export function httpRequest(
  port: number,
  path: string,
  opts: { headers?: Record<string, string>; method?: string } = {},
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port, path, method: opts.method ?? 'GET', headers: opts.headers },
      res => {
        const chunks: Buffer[] = []
        res.on('data', (d: Buffer) => chunks.push(d))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }))
      },
    )
    req.on('error', reject)
    req.end()
  })
}

/** 完整兑换链：launch token → GET /auth/redeem → session cookie（返回 set-cookie 原值） */
export async function redeemForCookie(port: number, token: string): Promise<string> {
  const res = await httpRequest(port, `/auth/redeem?token=${encodeURIComponent(token)}`)
  if (res.status !== 200) throw new Error(`redeem failed: ${res.status} ${res.body}`)
  const setCookie = res.headers['set-cookie']
  if (!setCookie?.length) throw new Error('redeem response missing Set-Cookie')
  return setCookie[0]!
}

/** 兑换出的 cookie 值抽取为请求用 cookie 头值 */
export function cookieHeaderValue(setCookie: string): string {
  const [pair] = setCookie.split(';')
  return pair ?? ''
}

export function makeTranscript(lines: SeedLine[]): SeedLine[] {
  return lines
}

export function stdTranscript(): SeedLine[] {
  return [
    { type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2026-11-16T08:00:00.000Z', message: { role: 'user', content: 'the quick brown fox' } },
    { type: 'assistant', uuid: 'a1', parentUuid: 'u1', timestamp: '2026-11-16T08:00:01.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'jumps over the lazy dog' }] } },
  ]
}
