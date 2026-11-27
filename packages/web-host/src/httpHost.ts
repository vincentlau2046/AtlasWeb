/**
 * Loopback HTTP carrier for the read-only session faces (G2, 格 D+H).
 *
 * node:http only — zero external dependencies. Every request passes the
 * loopback Host/Origin fence, then cookie auth, then the route table.
 * Routes expose the real controller (listSessions / replaySession) backed
 * by the upstream-published runtime; no product directory is ever read
 * here (that is the adapter's authorized domain alone).
 *
 * follow = SSE bridge over the upstream follow subscription (格 D+H):
 * GET /sessions/:id/follow streams WebSessionEvent v0 frames
 * (baseline/replacement/resetRequired/error/closed — closed 恒唯一
 * terminal); client disconnect releases the subscription (slot freed).
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import { isLoopbackRequest } from './fence'
import { pumpFollowEvents, SlowConsumerError } from './followPump'
import type { LaunchAuth } from './auth'
import type { SessionHost } from './sessionHost'
import { createExecutionRoutes } from './execution/executionRoutes'

export const SESSION_COOKIE = 'atlas_session'

export interface HttpHostOptions {
  sessionHost: SessionHost
  auth: LaunchAuth
  /** follow 流单次背压暂停超限（ms）→ fail-closed 强断（默认 30000；测试注入用）。 */
  followSlowConsumerMs?: number
  /** envelope productId（默认 'atlascode'；多产品部署时显式注入）。 */
  productId?: string
  /**
   * 可选静态面（同源组装：UI dist 与 API 同端口，反代拼装缺口的收口形）。
   * 语义 = auth 前的机会层：GET 且命中 root 内 regular file → 直接服；
   * 未命中 → 穿透原链（auth → 路由 → 404，既有行为零漂移）。静态内容
   * 为 npm 已公开资产（@atlasharness/atlasweb dist），零新增泄露面；
   * fence 仍全局面生效。fail-closed：非绝对路径/不存在/非目录 → throw。
   */
  staticDir?: string
  /**
   * 可选执行出口（B 附表 §1，默认 off）：提供即挂载 POST /execution/*
   * 路由（auth fence 之后）；缺省 = 404 且零 upstream 构造（E1 引擎零
   * 启动）。组合根恰一次（§7）由 executionRoutes 构造侧守卫。
   */
  execution?: {
    upstream: import('./execution/upstream').ExecutionUpstream
    workspaceAuth: import('./execution/workspaceAuth').WorkspaceAuthorizer
  }
}

// 静态面单文件上限（resourceLimit 形；dist 资产量级 ≤1MiB，64MiB 为粗界）。
const STATIC_MAX_BYTES = 64 * 1024 * 1024

// 显式 content-type 映射（fail-closed：未知扩展 → application/octet-stream
// + nosniff，绝不猜测）。vite dist 实际只产 html/js/css，余项为常见静态面兜底。
const STATIC_CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
}

// ⑥-B envelope（发布契约 WebSessionSuccessSchema / WebSessionErrorResponseSchema）：
// 成功形 {of, schemaVersion:0, requestId:UUID, productId, scopeId, kind:'response', ...payload}
// 错误形 {schemaVersion:0, requestId, productId, scopeId, kind:'error', error{code,message}}
function sendEnvelope(res: ServerResponse, of: string, scopeId: string, productId: string, payload: Record<string, unknown>): void {
  sendJson(res, 200, {
    of,
    ...payload,
    schemaVersion: 0,
    requestId: randomUUID(),
    productId,
    scopeId,
    kind: 'response',
  })
}

function sendContractError(res: ServerResponse, status: number, code: string, message: string, scopeId: string, productId: string): void {
  sendJson(res, status, {
    schemaVersion: 0,
    requestId: randomUUID(),
    productId,
    scopeId,
    kind: 'error',
    error: { code, message },
  })
}

// 执行出口 POST 体读入（B 附表 §1）：有界（3MiB = 合同 §8 2MiB text 上限
// + envelope 余量）；超限 → null（调用面映射 413）。非 JSON → null（调用面
// 映射 400 语义由 dispatch invalidCommand 承载）。
const EXECUTION_BODY_MAX_BYTES = 3 * 1024 * 1024
async function readJsonBody(req: IncomingMessage): Promise<unknown | null> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    total += (chunk as Buffer).length
    if (total > EXECUTION_BODY_MAX_BYTES) return null
    chunks.push(chunk as Buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return null
  }
}

function readCookie(req: IncomingMessage): string | undefined {
  const header = req.headers.cookie
  if (!header) return undefined
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === SESSION_COOKIE) return rest.join('=')
  }
  return undefined
}

/**
 * 凭据读取：ambient cookie 或非环境型 Bearer（CWE-522 处置——cookie 按
 * RFC 为 host 作用域不分端口，浏览器侧控制 = fence 严格 Host/Origin 相等；
 * E2E/CLI 客户端走 Authorization: Bearer 零 cookie jar 跨端口暴露）。
 */
function readCredential(req: IncomingMessage): string | undefined {
  const cookie = readCookie(req)
  if (cookie) return cookie
  const authz = req.headers.authorization
  if (authz?.startsWith('Bearer ')) return authz.slice('Bearer '.length) || undefined
  return undefined
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(payload)
}

/**
 * 静态面尝试（同步判定/读取；dist 资产量级 ≤1MiB，事件循环冲击可忽略）。
 * 返回 true = 已响应（200/403），false = 未命中（caller 穿透原链）。
 *
 * 校验链（fail-closed，lstat 纪律与 session 读链同形但按公开资产定宽——
 * 资产非密钥，containment 即足够，无需 O_NOFOLLOW 密钥级防护）：
 * decode → 段级 traversal 拒（'..' / NUL / 反斜杠；URL 归一化后的残余防线，
 * 编码 %2f 形在此拦截）→ join root → lstat 须 regular file（目录不列清单、
 * symlink 拒 = 逃逸面归零）→ realpath containment（defense-in-depth）→
 * size cap → 显式 content-type（未知扩展 octet-stream + nosniff）。
 * 缓存：'/index.html'（含 '/' 重写）no-cache；assets/ 前缀 immutable
 * （vite hash 命名形）；其余 no-cache 保守。
 */
function tryServeStatic(res: ServerResponse, pathname: string, staticRoot: string, isHead = false): boolean {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    sendJson(res, 400, { error: 'bad request' })
    return true
  }
  if (decoded.includes('\0') || decoded.includes('\\') || decoded.split('/').some(seg => seg === '..')) {
    sendJson(res, 403, { error: 'forbidden', code: 'scopeDenied' })
    return true
  }
  if (decoded === '/') decoded = '/index.html'
  const fsPath = join(staticRoot, decoded.slice(1))
  let lst: ReturnType<typeof lstatSync>
  try {
    lst = lstatSync(fsPath)
  } catch {
    return false // 未命中 → 穿透（auth → 路由 → 404/401 原语义）
  }
  if (!lst.isFile()) {
    // 目录不列清单；symlink（lstat 直接可见）拒 = 逃逸面归零
    sendJson(res, 403, { error: 'forbidden', code: 'scopeDenied' })
    return true
  }
  const real = realpathSync(fsPath)
  if (real !== staticRoot && !real.startsWith(`${staticRoot}/`)) {
    sendJson(res, 403, { error: 'forbidden', code: 'scopeDenied' })
    return true
  }
  if (lst.size > STATIC_MAX_BYTES) {
    sendJson(res, 413, { error: 'resource limit' })
    return true
  }
  const ext = extname(real).toLowerCase()
  const contentType = STATIC_CONTENT_TYPES[ext] ?? 'application/octet-stream'
  const immutable = decoded.startsWith('/assets/')
  const bytes = readFileSync(real)
  res.writeHead(200, {
    'content-type': contentType,
    'content-length': String(bytes.length),
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'x-content-type-options': 'nosniff',
  })
  // HEAD 腿（W-UI-V）：与 GET 同头（content-length 照实）零体——
  // favicon/资产探测面。POST 等写形仍拒（非 GET/HEAD 穿透原 404 链）。
  res.end(isHead ? undefined : bytes)
  return true
}

export function createHttpHost(options: HttpHostOptions): Server {
  const { sessionHost, auth } = options
  const productId = options.productId ?? 'atlascode'
  // 静态面 root 预解析（fail-closed：非绝对/不存在/非目录 → 零部分启动 throw；
  // realpath 收口为 containment 基准）。
  let staticRoot: string | null = null
  if (options.staticDir !== undefined) {
    if (!options.staticDir.startsWith('/')) throw new Error('staticDir must be an absolute path')
    const st = statSync(options.staticDir)
    if (!st.isDirectory()) throw new Error('staticDir must be a directory')
    staticRoot = realpathSync(options.staticDir)
  }
  // 执行出口路由（B 附表 §1）：仅在显式提供时构造（默认 off = 零构造，
  // E1 引擎零启动语义的上半）；重复注入同 upstream 在此构造期硬错（§7）。
  const executionRoutes = options.execution !== undefined
    ? createExecutionRoutes(options.execution)
    : null
  return createServer((req, res) => {
    void (async () => {
      try {
        // 1. fence（fail-closed：缺 Host/非 loopback/跨源 一律拒）
        const origin = req.headers.origin
        if (!isLoopbackRequest({ host: req.headers.host, origin: typeof origin === 'string' ? origin : undefined })) {
          sendJson(res, 403, { error: 'forbidden', code: 'scopeDenied' })
          return
        }
        const url = new URL(req.url ?? '/', 'http://invalid') // authority 占位；路由只看 pathname
        const path = url.pathname
        // 2a. 引导兑换路由（fence 之后、cookie 鉴权之前；token 单次性由
        // LaunchAuth 承载，重放/坏 token → 401）。
        if (req.method === 'GET' && path === '/auth/redeem') {
          const token = url.searchParams.get('token') ?? ''
          const cookie = auth.redeemLaunchToken(token)
          if (!cookie) {
            sendJson(res, 401, { error: 'invalid or already-redeemed token' })
            return
          }
          res.writeHead(200, {
            'content-type': 'application/json; charset=utf-8',
            'set-cookie': `${SESSION_COOKIE}=${cookie}; HttpOnly; SameSite=Strict; Path=/`,
          })
          res.end(JSON.stringify({ ok: true }))
          return
        }
        // 2a-bis. 静态面（auth 前机会层，仅 GET）：命中 root 内 regular file
        // → 同源服出（UI 首载 boot 路径无 cookie 可达）；未命中 → 穿透
        // 原链（auth → 路由 → 404，既有行为零漂移）。
        if ((req.method === 'GET' || req.method === 'HEAD') && staticRoot !== null && tryServeStatic(res, path, staticRoot, req.method === 'HEAD')) {
          return
        }
        // 2b. auth（ambient cookie 或非环境型 Bearer 凭据等价验证）
        if (!auth.verifySessionCookie(readCredential(req))) {
          sendJson(res, 401, { error: 'unauthorized' })
          return
        }
        // 3. 路由表
        // B 附表 §1 执行出口路由（auth fence 之后）：probe 仅连接级鉴权；
        // 五写命令 host 侧 bind 预校验（E1/E2）→ upstream（kernel 权威）。
        // 未启用 = 404 且零 upstream 构造（E1 引擎零启动；构造在 host
        // 创建期，未提供 options.execution 即从未发生）。
        if (req.method === 'POST' && path.startsWith('/execution/')) {
          if (executionRoutes === null) {
            sendJson(res, 404, { error: 'not found' })
            return
          }
          const sub = path.slice('/execution/'.length)
          if (sub === 'probe') {
            sendJson(res, 200, executionRoutes.probe())
            return
          }
          const body = await readJsonBody(req)
          if (body === null) {
            sendJson(res, 413, { error: 'resource limit' })
            return
          }
          const result = await executionRoutes.dispatch(body as Parameters<typeof executionRoutes.dispatch>[0])
          sendJson(res, result.status, result.body)
          return
        }
        // B 附表 §3 执行只读查询面 + 事件流（GET，auth fence 之后）。
        //  - /execution/events：SSE 执行流（首帧 = replay 三态 control 帧，
        //    其后 = 本会话事件；cursor 语义复用 §6，断线增量恰一次）。
        //  - /execution/queue：队列读投影（纯视图，零执法）。
        //  - /execution/approvals：服务端审批证据查询（workspace 强制限定，
        //    bind 不限定的跨域读取零路径）。
        // workspaceId 一律授权对表（未授权 403，事件/证据零泄露）；缺参 400。
        if (req.method === 'GET' && path.startsWith('/execution/')) {
          if (executionRoutes === null) {
            sendJson(res, 404, { error: 'not found' })
            return
          }
          const workspaceAuth = options.execution!.workspaceAuth
          const sub = path.slice('/execution/'.length)
          // B3 收尾波工单增量①：workspace discovery 端点（路由名定谳）——
          // GET /execution/workspaces，auth fence 后（本块前置 2b 已验）、
          // 与 /sessions 同层（/execution 路由族）；响应仅 workspaceId 字符串
          // （零目录内容/零凭据）；执行面未启用 → 404 零披露（E1）。可见性
          // ≠ 授权：服务端逐命令 workspaceAuth（E1）对表语义不变。
          if (sub === 'workspaces') {
            sendJson(res, 200, {
              workspaces: workspaceAuth.listGranted().map(id => ({ workspaceId: id })),
            })
            return
          }
          const ws = url.searchParams.get('workspaceId') ?? ''
          if (ws.length === 0) {
            sendJson(res, 400, { error: 'workspaceId required' })
            return
          }
          if (!workspaceAuth.isGranted(ws)) {
            sendJson(res, 403, { error: 'workspace not granted', code: 'workspaceNotGranted' })
            return
          }
          if (sub === 'queue') {
            const sessionId = url.searchParams.get('sessionId') ?? ''
            if (sessionId.length === 0) {
              sendJson(res, 400, { error: 'sessionId required' })
              return
            }
            sendJson(res, 200, executionRoutes.queueSnapshot(ws, sessionId))
            return
          }
          if (sub === 'approvals') {
            const sessionId = url.searchParams.get('sessionId') ?? undefined
            const turnId = url.searchParams.get('turnId') ?? undefined
            sendJson(res, 200, {
              workspaceId: ws,
              entries: executionRoutes.approvalEvidence(ws, {
                ...(sessionId !== undefined ? { sessionId } : {}),
                ...(turnId !== undefined ? { turnId } : {}),
              }),
            })
            return
          }
          if (sub === 'events') {
            const sessionId = url.searchParams.get('sessionId') ?? ''
            if (sessionId.length === 0) {
              sendJson(res, 400, { error: 'sessionId required' })
              return
            }
            const cursor = url.searchParams.get('cursor') ?? undefined
            res.writeHead(200, {
              'content-type': 'text/event-stream; charset=utf-8',
              'cache-control': 'no-cache',
              connection: 'keep-alive',
            })
            res.flushHeaders()
            let closed = false
            let finish: () => void = () => {}
            const finished = new Promise<void>((resolve) => {
              finish = resolve
            })
            const onClientClose = (): void => {
              if (closed) return
              closed = true
              finish()
            }
            req.on('close', onClientClose)
            res.on('close', onClientClose)
            // 写链：逐帧串行（顺序 = 入链序）；写回 false → 等 drain / close，
            // 单帧等待超 slowConsumerMs → fail-closed 强断（同 follow 慢消费者形）。
            let chain: Promise<void> = Promise.resolve()
            const enqueue = (frame: unknown): void => {
              const chunk = `data: ${JSON.stringify(frame)}\n\n`
              chain = chain.then(async () => {
                if (closed || res.writableEnded || res.destroyed) return
                const ok = res.write(chunk) || await new Promise<boolean>((resolve) => {
                  let settled = false
                  const timer = setTimeout(() => {
                    if (settled) return
                    settled = true
                    cleanup()
                    resolve(false)
                  }, options.followSlowConsumerMs ?? 30_000)
                  const done = (value: boolean) => (): void => {
                    if (settled) return
                    settled = true
                    clearTimeout(timer)
                    cleanup()
                    resolve(value)
                  }
                  const cleanup = (): void => {
                    res.off('drain', onDrain)
                    res.off('close', onGone)
                    res.off('error', onGone)
                  }
                  const onDrain = done(true)
                  const onGone = done(false)
                  res.once('drain', onDrain)
                  res.once('close', onGone)
                  res.once('error', onGone)
                })
                if (!ok) {
                  // 慢消费者/连接消失：强断（destroy 丢弃待发缓冲，零无限挂住）
                  if (!res.destroyed) res.destroy()
                  onClientClose()
                }
              })
            }
            // 订阅先建、replay 后取（防缝）：订阅至 replay 间的新事件缓冲，
            // 待 replay 帧入链后按事件 id 去重补入——增量恰一次（§6）。
            const buffered: unknown[] = []
            let streaming = false
            const matches = (event: unknown): boolean => {
              const bind = (event as { bind?: { workspaceId?: unknown; sessionId?: unknown } }).bind
              return bind?.workspaceId === ws && bind?.sessionId === sessionId
            }
            const unsubscribe = executionRoutes.subscribe((event) => {
              if (!matches(event)) return
              if (!streaming) {
                buffered.push(event)
                return
              }
              enqueue(event)
            })
            // 首帧 = replay 三态原形（kind ∈ baseline|delta|expired；事件帧由
            // type 字段区分，两形零歧义）。勿包裹改名：ExecutionReplay 自带
            // kind，展开在后会覆盖任何外层标记。
            const replay = executionRoutes.replay(ws, sessionId, cursor)
            enqueue(replay)
            const seen = new Set<string>()
            for (const event of replay.events) {
              const id = (event as { id?: unknown }).id
              if (typeof id === 'string') seen.add(id)
            }
            for (const event of buffered) {
              const id = (event as { id?: unknown }).id
              if (typeof id === 'string') {
                if (seen.has(id)) continue
                seen.add(id)
              }
              enqueue(event)
            }
            buffered.length = 0
            streaming = true
            try {
              // 流生命周期 = 客户端连接生命周期（断线 ≠ 取消，§4）：本处理
              // 悬挂至 close/fail-closed，订阅随之释放。
              await finished
            } finally {
              req.off('close', onClientClose)
              res.off('close', onClientClose)
              unsubscribe()
              closed = true
              if (!res.destroyed && !res.writableEnded) res.end()
            }
            return
          }
          sendJson(res, 404, { error: 'not found' })
          return
        }
        // S0-R4 件 A 第四面：search（query 界 1-256 码点 = 契约面，host 预验
        // fail-closed；runtime 信任上层已验——readonlyRuntime.d.ts:98）。
        if (req.method === 'GET' && path === '/sessions/search') {
          const scopeId = url.searchParams.get('scopeId') ?? 'main'
          const query = url.searchParams.get('q') ?? ''
          const codePoints = [...query].length
          if (codePoints < 1 || codePoints > 256) {
            sendContractError(res, 400, 'invalidRequest', 'query must be 1-256 code points', scopeId, productId)
            return
          }
          try {
            const result = await sessionHost.searchSessions({ scopeId, query })
            sendEnvelope(res, 'searchSessions', scopeId, productId, result)
          } catch (error) {
            const code = (error as { code?: string }).code
            if (code === 'scopeDenied') sendContractError(res, 403, 'scopeDenied', 'scope denied', scopeId, productId)
            else if (code === 'resourceLimit') sendContractError(res, 429, 'resourceLimit', 'resource limit', scopeId, productId)
            else sendJson(res, 500, { error: 'internal', code })
          }
          return
        }
        if (req.method === 'GET' && path === '/sessions') {
          const scopeId = url.searchParams.get('scopeId') ?? 'main'
          try {
            const result = await sessionHost.listSessions({ scopeId })
            sendEnvelope(res, 'listSessions', scopeId, productId, result)
          } catch (error) {
            const code = (error as { code?: string }).code
            if (code === 'scopeDenied') sendContractError(res, 403, 'scopeDenied', 'scope denied', scopeId, productId)
            else if (code === 'resourceLimit') sendContractError(res, 429, 'resourceLimit', 'resource limit', scopeId, productId)
            else sendJson(res, 500, { error: 'internal', code })
          }
          return
        }
        const replayMatch = path.match(/^\/sessions\/([^/]+)\/replay$/)
        if (req.method === 'GET' && replayMatch) {
          const scopeId = url.searchParams.get('scopeId') ?? 'main'
          // F6-PAGE S2（工单 docs/2026-11-25-f6-page-ticket.md §1 切片 2）：
          // 可选分页透传。request 零分页键 = 旧全量逐字节不变（键在场 =
          // carrier 分页判定）；?pageSize= host 预验十进制非负整数
          // fail-closed（search 面 query 界同形——值域 clamp 是 carrier
          // 域）；?pageToken= opaque 原样透传（carrier 解码判形）。
          const request: { scopeId: string; sessionId: string; pageSize?: number; pageToken?: string } = {
            scopeId,
            sessionId: decodeURIComponent(replayMatch[1]!),
          }
          const pageSizeRaw = url.searchParams.get('pageSize')
          if (pageSizeRaw !== null) {
            if (!/^\d{1,9}$/.test(pageSizeRaw)) {
              sendContractError(res, 400, 'invalidRequest', 'pageSize must be a non-negative integer', scopeId, productId)
              return
            }
            request.pageSize = Number(pageSizeRaw)
          }
          const pageToken = url.searchParams.get('pageToken')
          if (pageToken !== null) request.pageToken = pageToken
          try {
            const result = await sessionHost.replaySession(request)
            sendEnvelope(res, 'replaySession', scopeId, productId, result)
          } catch (error) {
            const code = (error as { code?: string }).code
            const message = String((error as Error).message ?? '')
            if (code === 'scopeDenied') sendContractError(res, 403, 'scopeDenied', 'scope denied', scopeId, productId)
            else if (code === 'notFound' || code === undefined && message.includes('not found')) sendContractError(res, 404, 'notFound', 'not found', scopeId, productId)
            // F6-PAGE S2 对表扩形：invalidRequest→400 / cursorExpired→400
            // （body code 区分，禁错页静默的显性 400 面）/
            // resourceLimit→429（沿 search/list 先例）。
            else if (code === 'invalidRequest') sendContractError(res, 400, 'invalidRequest', 'invalid request', scopeId, productId)
            else if (code === 'cursorExpired') sendContractError(res, 400, 'cursorExpired', 'replay page cursor expired', scopeId, productId)
            else if (code === 'resourceLimit') sendContractError(res, 429, 'resourceLimit', 'resource limit', scopeId, productId)
            else sendJson(res, 500, { error: 'internal', code: code ?? null })
          }
          return
        }
        const followMatch = path.match(/^\/sessions\/([^/]+)\/follow$/)
        if (req.method === 'GET' && followMatch) {
          const scopeId = url.searchParams.get('scopeId') ?? 'main'
          // e2e 发现③：resumeCursor 经 ?cursor= 透传（opaque，域内解释；
          // 未知/过期 cursor → 上游契约显式 resetRequired 重入）
          const cursor = url.searchParams.get('cursor') ?? undefined
          const ac = new AbortController()
          let sub: Awaited<ReturnType<typeof sessionHost.followSession>> | null = null
          let clientGone = false
          const onClientClose = (): void => {
            clientGone = true
            ac.abort()
            // 立即释放（不等下一事件唤醒拉取循环）；close 幂等
            void sub?.close().catch(() => {})
          }
          req.on('close', onClientClose)
          try {
            // 订阅创建在流前：notFound/scopeDenied 等分态先映射，再切 SSE；
            // signal 贯穿上游订阅 worker（创建在途断开即时取消）。
            sub = await sessionHost.followSession({ scopeId, sessionId: decodeURIComponent(followMatch[1]!), ...(cursor !== undefined ? { resumeCursor: cursor } : {}) }, ac.signal)
          } catch (error) {
            req.off('close', onClientClose)
            const code = (error as { code?: string }).code
            const message = String((error as Error).message ?? '')
            if (code === 'scopeDenied') sendJson(res, 403, { error: 'scope denied', code })
            else if (code === 'notFound' || code === undefined && message.includes('not found')) sendJson(res, 404, { error: 'not found', code: code ?? 'notFound' })
            else if (code === 'resourceLimit') sendJson(res, 429, { error: 'resource limit', code })
            else sendJson(res, 500, { error: 'internal', code: code ?? null })
            return
          }
          if (clientGone) {
            // 创建在途即断开：订阅已随 signal 取消/关闭，零响应面
            req.off('close', onClientClose)
            await sub.close().catch(() => {})
            return
          }
          res.writeHead(200, {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          })
          // S0-R5 零重放 resume 下首事件可能长期不到达（零新写入）——
          // writeHead 仅缓存头，须显式冲刷，否则消费者悬挂于无头连接。
          res.flushHeaders()
          try {
            await pumpFollowEvents(sub, res, { slowConsumerMs: options.followSlowConsumerMs }, () => clientGone)
          } catch (error) {
            if (error instanceof SlowConsumerError) {
              // 慢消费者超限 → 强断：destroy 丢弃待发缓冲并立即 RST/FIN
              //（优雅 end 会先冲缓冲——零窗口客户端下连接无限挂住）。
              res.destroy()
              return
            }
            // 其余订阅侧异常：尽力优雅终流；消费者按 SSE 重连语义处理。
          } finally {
            // 注：finally 兜底 res.end() 仅在流未销毁时执行（destroy 路径零冲击）
            req.off('close', onClientClose)
            ac.abort()
            // 客户端断开/流终 → 订阅释放（槽位归零，close 幂等）
            await sub.close().catch(() => {})
            if (!clientGone && !res.writableEnded && !res.destroyed) res.end()
          }
          return
        }
        sendJson(res, 404, { error: 'not found' })
      } catch (error) {
        sendJson(res, 500, { error: 'internal', detail: String((error as Error).message ?? '') })
      }
    })()
  })
}
