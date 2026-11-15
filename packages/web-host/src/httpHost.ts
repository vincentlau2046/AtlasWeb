/**
 * Loopback HTTP carrier for the read-only session faces (G2, 格 D+H).
 *
 * node:http only — zero external dependencies. Every request passes the
 * loopback Host/Origin fence, then cookie auth, then the route table.
 * Routes expose the real controller (listSessions / replaySession) backed
 * by the upstream-published runtime; no product directory is ever read
 * here (that is the adapter's authorized domain alone).
 *
 * follow (WS/SSE stream) is a follow-up slice; this carrier ships the
 * request/response faces.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { isLoopbackRequest } from './fence'
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
        sendJson(res, 404, { error: 'not found' })
      } catch (error) {
        sendJson(res, 500, { error: 'internal', detail: String((error as Error).message ?? '') })
      }
    })()
  })
}
