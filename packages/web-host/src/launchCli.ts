/**
 * Host 启动入口（E2E seam，裁定 ③）。
 *
 * 用法（bun 直跑 TS，零构建步）：
 *   bun packages/web-host/src/launchCli.ts \
 *     --port 0 \
 *     --secret <>=16B> \
 *     --scope main=/path/to/sessions [--scope work=/path2 ...] \
 *     [--static /path/to/atlasweb-dist] \
 *     [--follow-slow-consumer-ms 30000]
 *
 * --static：可选 UI 静态面（如 node_modules/@atlasharness/atlasweb/dist）
 * ——同源组装（UI + API 一端口一条命令，反代拼装缺口的收口形）。缺省 =
 * 纯 API host（行为零变化）。
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
import { createExecutionUpstream } from './execution/upstream'
import { createWorkspaceAuthorizer } from './execution/workspaceAuth'
import { randomBytes } from 'node:crypto'

interface CliArgs {
  port: number
  /** 可选：显式 secret（仅测试用——argv 经 /proc/cmdline 世界可读，CWE-214）。缺省 = 进程内 randomBytes(32) 即弃 secret。 */
  secret?: string
  scopes: Array<{ scopeId: string; storageDir: string }>
  followSlowConsumerMs?: number
  sessionTtlMs?: number
  /** 可选：UI 静态面目录（同源组装，httpHost.staticDir）。 */
  staticDir?: string
  /** 执行能力开关（B 附表 §1，默认 off——缺省零构造零路由）。 */
  execution: boolean
  /** 逐工作区授权绑定 id=dir（仅 --execution 下必填 ≥1）。 */
  workspaces: Array<{ workspaceId: string; dir: string }>
  /** actorId 真源（F2 fail-closed：--execution 下必填非空）。 */
  actorId?: string
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { port: 0, scopes: [], execution: false, workspaces: [] }
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
    else if (a === '--static') args.staticDir = argv[++i] ?? ''
    else if (a === '--execution') args.execution = true
    else if (a === '--workspace') {
      const spec = argv[++i] ?? ''
      const eq = spec.indexOf('=')
      if (eq <= 0) throw new Error(`--workspace expects id=dir, got "${spec}"`)
      args.workspaces.push({ workspaceId: spec.slice(0, eq), dir: spec.slice(eq + 1) })
    } else if (a === '--actor-id') args.actorId = argv[++i] ?? ''
    else throw new Error(`unknown argument: ${a}`)
  }
  if (args.secret !== undefined && args.secret.length < 16) throw new Error('--secret (if given) must be >=16 bytes')
  if (!Number.isInteger(args.port) || args.port < 0 || args.port > 65535) throw new Error('--port invalid')
  // 数值参数 fail-closed（e2e 发现④）：NaN/Infinity 不得静默入
  // createLaunchAuth（ttl 行为未定义）/ pump 超时（setTimeout(NaN) 即触发
  // = 每条 follow 流被立刻强断）。
  if (args.sessionTtlMs !== undefined && (!Number.isFinite(args.sessionTtlMs) || args.sessionTtlMs <= 0)) {
    throw new Error('--session-ttl-ms must be a positive finite number')
  }
  if (args.followSlowConsumerMs !== undefined && (!Number.isFinite(args.followSlowConsumerMs) || args.followSlowConsumerMs <= 0)) {
    throw new Error('--follow-slow-consumer-ms must be a positive finite number')
  }
  if (args.scopes.length === 0) throw new Error('at least one --scope id=dir required')
  if (args.staticDir !== undefined && !args.staticDir.startsWith('/')) throw new Error('--static must be an absolute path')
  // 执行能力（B 附表 §1，默认 off）：显式开启才要求配套（fail-closed：
  // workspace 绑定 ≥1 + actorId 非空——F2 web 车道零 ambient）。
  if (args.execution) {
    if (args.workspaces.length === 0) throw new Error('--execution requires at least one --workspace id=dir')
    if (typeof args.actorId !== 'string' || args.actorId.length === 0) {
      throw new Error('--execution requires --actor-id (web lane fail-closed, F2) — ambient fallback is CLI-lane only')
    }
  } else if (args.workspaces.length > 0 || (args.actorId !== undefined && args.actorId.length > 0)) {
    throw new Error('--workspace/--actor-id only valid together with --execution')
  }
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
  // 执行能力装配（B 附表 §1，默认 off——args.execution=false 时零构造，
  // E1 引擎零启动语义）。单接触点：装配面只 import upstream 薄适配。
  let execution: Parameters<typeof createHttpHost>[0]['execution'] | undefined
  if (args.execution) {
    const workspaceAuth = createWorkspaceAuthorizer()
    for (const { workspaceId, dir } of args.workspaces) workspaceAuth.grantWorkspace(workspaceId, dir)
    const upstream = createExecutionUpstream({
      actorId: () => args.actorId!,
      workspaceDir: (id) => workspaceAuth.workspaceDir(id),
    })
    execution = { upstream, workspaceAuth }
  }
  const server = createHttpHost({
    sessionHost,
    auth,
    ...(args.followSlowConsumerMs !== undefined ? { followSlowConsumerMs: args.followSlowConsumerMs } : {}),
    ...(args.staticDir !== undefined ? { staticDir: args.staticDir } : {}),
    ...(execution !== undefined ? { execution } : {}),
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
      // 关闭序（e2e 发现①）：先关 sessionHost → 活跃订阅终止 → SSE 泵
      // 自然终流断连 → server.close 可完成；closeAllConnections 兜底
      // （残存空闲连接强拆）。server.close 先行会永等 SSE 连接 → 挂死。
      const closeWithTimeout = (p: Promise<void>, ms: number): Promise<void> =>
        Promise.race([p, new Promise<void>(r => setTimeout(r, ms))])
      await closeWithTimeout(sessionHost.close(), 2000)
      server.closeAllConnections?.()
      await closeWithTimeout(new Promise<void>(resolve => server.close(() => resolve())), 2000)
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
