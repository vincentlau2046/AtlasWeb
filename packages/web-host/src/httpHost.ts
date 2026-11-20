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
          try {
            const result = await sessionHost.replaySession({ scopeId, sessionId: decodeURIComponent(replayMatch[1]!) })
            sendEnvelope(res, 'replaySession', scopeId, productId, result)
          } catch (error) {
            const code = (error as { code?: string }).code
            const message = String((error as Error).message ?? '')
            if (code === 'scopeDenied') sendContractError(res, 403, 'scopeDenied', 'scope denied', scopeId, productId)
            else if (code === 'notFound' || code === undefined && message.includes('not found')) sendContractError(res, 404, 'notFound', 'not found', scopeId, productId)
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
