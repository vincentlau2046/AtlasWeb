// T6-A Task 9 RED: 构建产物 fetch 级烟测 + 只读词表负腿。
// 词表唯一事实源 = docs/t6a-readonly-lexicon.md（```lexicon 块逐词读取——
// 禁测试侧另立词表）。烟测链 = vite build → serve dist → fetch /auth/redeem
// → 四面 API 全通 + 构建产物词表零命中。
import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createServer, request as httpRequest_, type IncomingMessage, type ServerResponse } from 'node:http'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cookieHeaderValue, httpRequest, launchHost, makeSeedDir, redeemForCookie, rmDir, stdTranscript } from './e2e/helpers'

const HOST = '127.0.0.1'

/** SSE head read: status + first body chunk, then destroy (never buffers the stream). */
function openFollowHead(port: number, path: string, headers: Record<string, string>): Promise<{ status: number | undefined; contentType: string | undefined; firstChunk: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest_({ host: HOST, port, path, headers }, res => {
      let first = ''
      const timer = setTimeout(() => { res.destroy(); resolve({ status: res.statusCode, contentType: res.headers['content-type'], firstChunk: first }) }, 3000)
      res.on('data', (chunk: Buffer) => {
        first += chunk.toString('utf8')
        clearTimeout(timer)
        res.destroy()
        resolve({ status: res.statusCode, contentType: res.headers['content-type'], firstChunk: first })
      })
      res.on('error', () => { /* destroy-induced */ })
    })
    req.on('error', reject)
    req.end()
  })
}

const APP = fileURLToPath(new URL('..', import.meta.url)) // apps/atlasweb/
const REPO = fileURLToPath(new URL('../../..', import.meta.url))
const LEXICON_DOC = join(REPO, 'docs', 't6a-readonly-lexicon.md')
const SCAN_DIRS = [
  'packages/web-code/src',
  'packages/web-brand/src',
  'packages/web-mode/src',
  'apps/atlasweb/src',
].map(dir => join(REPO, dir))

/** Parse the ```lexicon fenced block (one word per line) from the lexicon doc. */
function parseLexicon(doc: string): string[] {
  const match = /```lexicon\n([\s\S]*?)\n```/.exec(doc)
  if (match === null) return []
  return match[1]!.split('\n').map(line => line.trim()).filter(line => line.length > 0)
}

/** Recursively list files under a directory (skips node_modules). */
function walk(dir: string): string[] {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return []
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

/** Scan files for lexicon words; returns {word, file, line} hits. */
function scan(words: string[], files: string[]): Array<{ word: string; file: string; line: number }> {
  const hits: Array<{ word: string; file: string; line: number }> = []
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    const lines = text.split('\n')
    for (const word of words) {
      lines.forEach((line, index) => {
        if (line.includes(word)) hits.push({ word, file, line: index + 1 })
      })
    }
  }
  return hits
}

describe('只读词表负腿（docs/t6a-readonly-lexicon.md 预注册）', () => {
  test('词表落档非空且含锚词（预注册纪律——禁空表过门）', () => {
    const doc = readFileSync(LEXICON_DOC, 'utf8')
    const words = parseLexicon(doc)
    expect(words.length).toBeGreaterThanOrEqual(8)
    for (const anchor of ['composer', 'approval', 'cancelSession', 'submitInput']) {
      expect(words).toContain(anchor)
    }
  })

  test('source 扫描域零命中（豁免表外）', () => {
    const words = parseLexicon(readFileSync(LEXICON_DOC, 'utf8'))
    const files = SCAN_DIRS.flatMap(dir => walk(dir))
    expect(files.length).toBeGreaterThan(5)
    const hits = scan(words, files)
    expect(hits).toEqual([])
  })
})

describe('构建产物烟测（vite build → serve dist → fetch）', () => {
  let dist = ''
  let bundleName = ''

  test('vite build 产出 index.html + JS bundle', () => {
    const result = spawnSync('bun', ['run', 'build'], { cwd: APP, encoding: 'utf8', env: { ...process.env, CI: '1' }, timeout: 120_000 })
    if (result.status !== 0) throw new Error(`vite build failed:\n${result.stdout}\n${result.stderr}`)
    dist = join(APP, 'dist')
    expect(existsSync(join(dist, 'index.html'))).toBe(true)
    const assets = readdirSync(join(dist, 'assets')).filter(name => name.endsWith('.js'))
    expect(assets.length).toBeGreaterThan(0)
    bundleName = assets[0]!
  })

  test('bundle 含四面接线标记（mode/slot id/service name 字面量）', () => {
    const bundle = readFileSync(join(dist, 'assets', bundleName), 'utf8')
    expect(bundle).toContain('web-code.nav')
    expect(bundle).toContain('web-code.conversation')
    expect(bundle).toContain('conversation')
  })

  test('bundle 构建产物零词表命中', () => {
    const words = parseLexicon(readFileSync(LEXICON_DOC, 'utf8'))
    const files = walk(dist)
    expect(files.length).toBeGreaterThan(1)
    const hits = scan(words, files)
    expect(hits).toEqual([])
  })

  test('serve dist → GET / 与 bundle asset 均 200', async () => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = (req.url ?? '/').split('?')[0]!
      const file = url === '/' ? join(dist, 'index.html') : join(dist, url)
      if (existsSync(file) && statSync(file).isFile()) {
        const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream'
        res.writeHead(200, { 'content-type': type })
        res.end(readFileSync(file))
      } else {
        res.writeHead(404)
        res.end('not found')
      }
    })
    await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve) })
    const port = (server.address() as { port: number }).port
    try {
      const index = await httpRequest(port, '/')
      expect(index.status).toBe(200)
      expect(index.body).toContain(bundleName)
      const asset = await httpRequest(port, `/assets/${bundleName}`)
      expect(asset.status).toBe(200)
      expect(asset.body.length).toBeGreaterThan(1000)
    } finally {
      server.close()
    }
  })
})

describe('auth + 四面全通（真实进程 fetch 级）', () => {
  test('redeem → list → replay → search → follow 首事件', async () => {
    const dir = makeSeedDir('atlasweb-smoke-', { 'sess-1': stdTranscript() })
    const host = await launchHost({ scopes: [{ id: 'main', dir }] })
    try {
      const cookie = cookieHeaderValue(await redeemForCookie(host.port, host.token))
      expect(cookie).toContain('atlas_session=')

      const list = await httpRequest(host.port, '/sessions?scopeId=main', { headers: { cookie } })
      expect(list.status).toBe(200)
      expect((JSON.parse(list.body) as { sessions: unknown[] }).sessions.length).toBeGreaterThan(0)

      const replay = await httpRequest(host.port, '/sessions/sess-1/replay?scopeId=main', { headers: { cookie } })
      expect(replay.status).toBe(200)
      expect((JSON.parse(replay.body) as { projection: { semantics: string } }).projection.semantics).toBe('persisted-effective-conversation')

      const search = await httpRequest(host.port, '/sessions/search?scopeId=main&q=quick%20brown', { headers: { cookie } })
      expect(search.status).toBe(200)
      expect((JSON.parse(search.body) as { results: unknown[] }).results.length).toBeGreaterThan(0)

      const follow = await openFollowHead(host.port, '/sessions/sess-1/follow?scopeId=main', { cookie })
      expect(follow.status).toBe(200)
      expect(follow.contentType).toContain('text/event-stream')
      expect(follow.firstChunk).toContain('data:')
    } finally {
      await host.stop()
      rmDir(dir)
    }
  }, 30_000)
})
