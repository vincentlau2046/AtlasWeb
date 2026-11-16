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

export function createHttpHost(options: HttpHostOptions): Server {
  const { sessionHost, auth } = options
  const productId = options.productId ?? 'atlascode'
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
