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
import { isLoopbackRequest } from './fence'
import { pumpFollowEvents, SlowConsumerError } from './followPump'
import type { LaunchAuth } from './auth'
import type { SessionHost } from './sessionHost'

export const SESSION_COOKIE = 'atlas_session'

export interface HttpHostOptions {
  sessionHost: SessionHost
  auth: LaunchAuth
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

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(payload)
}

export function createHttpHost(options: HttpHostOptions): Server {
  const { sessionHost, auth } = options
  return createServer((req, res) => {
    void (async () => {
      try {
        // 1. fence（fail-closed：缺 Host/非 loopback/跨源 一律拒）
        const origin = req.headers.origin
        if (!isLoopbackRequest({ host: req.headers.host, origin: typeof origin === 'string' ? origin : undefined })) {
          sendJson(res, 403, { error: 'forbidden', code: 'scopeDenied' })
          return
        }
        // 2. auth
        if (!auth.verifySessionCookie(readCookie(req))) {
          sendJson(res, 401, { error: 'unauthorized' })
          return
        }
        const url = new URL(req.url ?? '/', 'http://invalid') // authority 占位；路由只看 pathname
        const path = url.pathname
        // 3. 路由表
        if (req.method === 'GET' && path === '/sessions') {
          const scopeId = url.searchParams.get('scopeId') ?? 'main'
          try {
            const result = await sessionHost.listSessions({ scopeId })
            sendJson(res, 200, result)
          } catch (error) {
            const code = (error as { code?: string }).code
            if (code === 'scopeDenied') sendJson(res, 403, { error: 'scope denied', code })
            else if (code === 'resourceLimit') sendJson(res, 429, { error: 'resource limit', code })
            else sendJson(res, 500, { error: 'internal', code })
          }
          return
        }
        const replayMatch = path.match(/^\/sessions\/([^/]+)\/replay$/)
        if (req.method === 'GET' && replayMatch) {
          const scopeId = url.searchParams.get('scopeId') ?? 'main'
          try {
            const result = await sessionHost.replaySession({ scopeId, sessionId: decodeURIComponent(replayMatch[1]!) })
            sendJson(res, 200, result)
          } catch (error) {
            const code = (error as { code?: string }).code
            const message = String((error as Error).message ?? '')
            if (code === 'scopeDenied') sendJson(res, 403, { error: 'scope denied', code })
            else if (code === 'notFound' || code === undefined && message.includes('not found')) sendJson(res, 404, { error: 'not found', code: code ?? 'notFound' })
            else sendJson(res, 500, { error: 'internal', code: code ?? null })
          }
          return
        }
        const followMatch = path.match(/^\/sessions\/([^/]+)\/follow$/)
        if (req.method === 'GET' && followMatch) {
          const scopeId = url.searchParams.get('scopeId') ?? 'main'
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
            sub = await sessionHost.followSession({ scopeId, sessionId: decodeURIComponent(followMatch[1]!) }, ac.signal)
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
            await pumpFollowEvents(sub, res, undefined, () => clientGone)
          } catch (error) {
            // 订阅侧异常 / 慢消费者超限（SlowConsumerError → fail-closed 终流 +
            // 订阅释放，槽位归零；消费者按 SSE 重连语义处理）。
            void error
          } finally {
            req.off('close', onClientClose)
            ac.abort()
            // 客户端断开/流终 → 订阅释放（槽位归零，close 幂等）
            await sub.close().catch(() => {})
            if (!clientGone && !res.writableEnded) res.end()
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
