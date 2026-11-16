/**
 * Host 启动入口（E2E seam，裁定 ③）。
 *
 * 用法（bun 直跑 TS，零构建步）：
 *   bun packages/web-host/src/launchCli.ts \
 *     --port 0 \
 *     --secret <>=16B> \
 *     --scope main=/path/to/sessions [--scope work=/path2 ...] \
 *     [--follow-slow-consumer-ms 30000]
 *
 * 就绪协议：stdout 恰一行 JSON `{"ready":true,"port":<n>,"token":"<launch-token>"}`
 * ——token 为单次 launch token，客户端经 GET /auth/redeem?token= 兑换
 * session cookie（父进程/E2E 零直造 cookie）。SIGTERM/SIGINT → 优雅关闭
 * （server.close + sessionHost.close）后退出 0。
 *
 * fail-closed：secret 缺失/过短、scope 缺失或格式错、storageDir 非绝对路径
 * → 非零退出，零部分启动。
 */
import { createSessionHost, type SessionHost } from './sessionHost'
import { createLaunchAuth } from './auth'
import { createHttpHost } from './httpHost'
import { randomBytes } from 'node:crypto'

interface CliArgs {
  port: number
  /** 可选：显式 secret（仅测试用——argv 经 /proc/cmdline 世界可读，CWE-214）。缺省 = 进程内 randomBytes(32) 即弃 secret。 */
  secret?: string
  scopes: Array<{ scopeId: string; storageDir: string }>
  followSlowConsumerMs?: number
  sessionTtlMs?: number
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { port: 0, scopes: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === '--port') args.port = Number(argv[++i] ?? '')
    else if (a === '--secret') args.secret = argv[++i] ?? ''
    else if (a === '--scope') {
      const spec = argv[++i] ?? ''
      const eq = spec.indexOf('=')
      if (eq <= 0) throw new Error(`--scope expects id=dir, got "${spec}"`)
      args.scopes.push({ scopeId: spec.slice(0, eq), storageDir: spec.slice(eq + 1) })
    } else if (a === '--follow-slow-consumer-ms') args.followSlowConsumerMs = Number(argv[++i] ?? '')
    else if (a === '--session-ttl-ms') args.sessionTtlMs = Number(argv[++i] ?? '')
    else throw new Error(`unknown argument: ${a}`)
  }
  if (args.secret !== undefined && args.secret.length < 16) throw new Error('--secret (if given) must be >=16 bytes')
  if (!Number.isInteger(args.port) || args.port < 0 || args.port > 65535) throw new Error('--port invalid')
  if (args.scopes.length === 0) throw new Error('at least one --scope id=dir required')
  return args
}

export async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv)
  const sessionHost: SessionHost = createSessionHost({
    productId: 'atlascode',
    scopes: args.scopes,
  })
  const auth = createLaunchAuth({
    // CWE-214：缺省即弃 secret（randomBytes 32B，仅存进程内）；--secret 形态
    // 仅供测试复现，勿在生产使用（/proc/cmdline 世界可读）。
    secret: args.secret ?? randomBytes(32).toString('base64url'),
    ...(args.sessionTtlMs !== undefined ? { sessionTtlMs: args.sessionTtlMs } : {}),
  })
  const server = createHttpHost({
    sessionHost,
    auth,
    ...(args.followSlowConsumerMs !== undefined ? { followSlowConsumerMs: args.followSlowConsumerMs } : {}),
  })
  await sessionHost.start()
  await new Promise<void>(resolve => server.listen(args.port, '127.0.0.1', resolve))
  const addr = server.address()
  const port = typeof addr === 'object' && addr !== null ? addr.port : args.port
  const token = auth.issueLaunchToken()
  // 就绪协议：恰一行 JSON（其余诊断走 stderr）
  process.stdout.write(`${JSON.stringify({ ready: true, port, token })}\n`)

  let closing = false
  const shutdown = (signal: string): void => {
    if (closing) return
    closing = true
    process.stderr.write(`[${signal}] shutting down\n`)
    void (async () => {
      await new Promise<void>(resolve => server.close(() => resolve()))
      await sessionHost.close()
      process.exit(0)
    })()
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

// 直跑入口（bun launchCli.ts …）
if (import.meta.main) {
  try {
    await main(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`fatal: ${(error as Error).message}\n`)
    process.exit(1)
  }
}
