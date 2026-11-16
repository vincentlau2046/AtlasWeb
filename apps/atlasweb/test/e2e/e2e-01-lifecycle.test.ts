import { describe, expect, test } from 'bun:test'
import { launchHost, makeSeedDir, rmDir, stdTranscript } from './helpers'
import { createServer } from 'node:net'

// E2E-01 真实进程启动与健康（计划 v1）：
// 1. --port 0 → ready 行 JSON（port>0、token 非空），进程存活；
// 2. SIGTERM → 优雅关闭退出 0，端口释放（可重新绑定）；
// 3. fail-closed：缺 secret / 坏 scope 格式 / 未知参数 → 非零退出、零部分启动（无 ready 行）。

describe('E2E-01 host process lifecycle', () => {
  test('launches on kernel-assigned port and emits exactly one ready line', async () => {
    const dir = makeSeedDir('atlasweb-e2e01-', { 'sess-1': stdTranscript() })
    let host: Awaited<ReturnType<typeof launchHost>> | null = null
    try {
      host = await launchHost({ scopes: [{ id: 'main', dir }] })
      expect(host.port).toBeGreaterThan(0)
      expect(host.token.length).toBeGreaterThan(0)
      expect(host.proc.exitCode).toBeNull()
      expect(host.proc.signalCode).toBeNull()
    } finally {
      if (host) await host.stop()
      rmDir(dir)
    }
  }, 30000)

  test('SIGTERM → graceful exit 0 → port released', async () => {
    const dir = makeSeedDir('atlasweb-e2e01b-', { 'sess-1': stdTranscript() })
    const host = await launchHost({ scopes: [{ id: 'main', dir }] })
    try {
      const code = await host.stop()
      expect(code).toBe(0)
      // 端口已释放：能以 LISTEN 独占绑定同一端口
      const freed = await new Promise<boolean>(resolve => {
        const probe = createServer()
        probe.once('error', () => resolve(false))
        probe.listen(host.port, '127.0.0.1', () => probe.close(() => resolve(true)))
      })
      expect(freed).toBe(true)
    } finally {
      rmDir(dir)
    }
  }, 30000)

  test('fail-closed: bad args exit non-zero with zero partial startup (no ready line)', async () => {
    const dir = makeSeedDir('atlasweb-e2e01c-', { 'sess-1': stdTranscript() })
    const { spawn } = await import('node:child_process')
    const LAUNCH_CLI = new URL('../../../../packages/web-host/src/launchCli.ts', import.meta.url).pathname
    const cases: string[][] = [
      ['--port', '0'], // 缺 secret
      ['--port', '0', '--secret', 'short'], // secret <16B
      ['--port', '0', '--secret', 'e2e-failclosed-secret-32-bytes!!', '--scope', 'mainrelative'], // scope 缺 =
      ['--port', '0', '--secret', 'e2e-failclosed-secret-32-bytes!!', '--scope', 'main=' + dir, '--bogus'], // 未知参数
    ]
    try {
      for (const args of cases) {
        const proc = spawn('bun', [LAUNCH_CLI, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
        const result = await new Promise<{ code: number | null; stdout: string }>(resolve => {
          let stdout = ''
          proc.stdout!.on('data', (d: Buffer) => { stdout += d.toString() })
          proc.once('exit', code => resolve({ code: code ?? -1, stdout }))
        })
        expect(result.code).not.toBe(0)
        expect(result.stdout).not.toContain('"ready"')
      }
    } finally {
      rmDir(dir)
    }
  }, 60000)
})
