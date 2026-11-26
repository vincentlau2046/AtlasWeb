import { describe, expect, test } from 'bun:test'

// F6-PAGE S2（工单 docs/2026-11-25-f6-page-ticket.md §1 切片 2，f4 开工令
// 2026-11-26）：GET /sessions/:id/replay `?pageToken=&pageSize=` 透传 +
// 404/403/400 fail-closed 对表。fixture 层先行（runtimeOverride 注入缝，
// 真 carrier pin 0.1.127 无分页契约——S3/段 L pin bump 后真连）。
//
// 冻结面（S2 契约）：
//  - 无分页参 → request 零分页键（carrier 分页判定 = 键在场）、envelope
//    旧形不变（格 2 加性兼容）；
//  - ?pageSize=（十进制非负整数字符串）→ request.pageSize number 透传；
//    畸形（非数字/负/小数/空串）→ 400 invalidRequest（host 预验
//    fail-closed，search 面 query 界同形）；
//  - ?pageToken= → opaque string 原样透传（carrier 解码判形）；
//  - 错误映射对表：invalidRequest→400、cursorExpired→400（body code
//    区分）、resourceLimit→429（沿 search/list 先例）、scopeDenied→403、
//    notFound→404 保持。
import { createSessionHost } from '../src/sessionHost'
import { createHttpHost } from '../src/httpHost'
import { createLaunchAuth } from '../src/auth'

const HOST = '127.0.0.1'

interface RecordedRequest {
  scopeId: string
  sessionId: string
  pageSize?: number
  pageToken?: string
}

interface Harness {
  base: string
  headers: { host: string; cookie: string }
  calls: RecordedRequest[]
  respondWith: (impl: (req: RecordedRequest) => unknown) => void
  stop: () => Promise<void>
}

async function startHarness(): Promise<Harness> {
  const calls: RecordedRequest[] = []
  let impl: (req: RecordedRequest) => unknown = req => ({
    of: 'replaySession',
    projection: {
      sessionId: req.sessionId,
      productId: 'atlascode',
      scopeId: req.scopeId,
      semantics: 'persisted-effective-conversation',
      messages: [],
      truncated: false,
    },
  })
  const fakeRuntime = {
    epoch: 'fake-epoch',
    limits: { maxSubscriptions: 8 },
    start: async () => {},
    close: async () => {},
    listSessions: async () => ({ sessions: [] }),
    replaySession: async (req: RecordedRequest) => {
      calls.push(req)
      return impl(req)
    },
    followSession: async () => {
      throw new Error('not used')
    },
    searchSessions: async () => ({ matches: [] }),
  }
  const sessionHost = createSessionHost({
    productId: 'atlascode',
    scopes: [{ scopeId: 'main', storageDir: '/tmp' }],
    runtimeOverride: fakeRuntime as never,
  })
  const auth = createLaunchAuth({ secret: 'replay-paging-secret-32-bytes!!!' })
  const server = createHttpHost({ sessionHost, auth })
  await new Promise<void>(resolve => server.listen(0, HOST, resolve))
  const port = (server.address() as { port: number }).port
  await sessionHost.start()
  const cookie = auth.redeemLaunchToken(auth.issueLaunchToken())!
  return {
    base: `http://${HOST}:${port}`,
    headers: { host: `${HOST}:${port}`, cookie: `atlas_session=${cookie}` },
    calls,
    respondWith: next => {
      impl = next
    },
    async stop() {
      await new Promise<void>(resolve => server.close(() => resolve()))
      await sessionHost.close()
    },
  }
}

const get = (h: Harness, url: string) => fetch(`${h.base}${url}`, { headers: h.headers })

describe('GET /sessions/:id/replay 分页透传（F6-PAGE S2）', () => {
  test('A 无分页参：request 零分页键 + envelope 旧形（加性兼容）', async () => {
    const h = await startHarness()
    try {
      const res = await get(h, '/sessions/sess-1/replay?scopeId=main')
      expect(res.status).toBe(200)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.of).toBe('replaySession')
      expect(h.calls).toHaveLength(1)
      expect(h.calls[0]).toEqual({ scopeId: 'main', sessionId: 'sess-1' })
      expect('pageSize' in h.calls[0]!).toBe(false)
      expect('pageToken' in h.calls[0]!).toBe(false)
    } finally {
      await h.stop()
    }
  })

  test('B ?pageSize=7 → request.pageSize=7（number 透传）', async () => {
    const h = await startHarness()
    try {
      const res = await get(h, '/sessions/sess-1/replay?scopeId=main&pageSize=7')
      expect(res.status).toBe(200)
      expect(h.calls[0]!.pageSize).toBe(7)
      expect('pageToken' in h.calls[0]!).toBe(false)
    } finally {
      await h.stop()
    }
  })

  test('C ?pageToken=x → request.pageToken 原样透传（opaque）', async () => {
    const h = await startHarness()
    try {
      const res = await get(
        h,
        `/sessions/sess-1/replay?scopeId=main&pageToken=${encodeURIComponent('aGk_-$')}`,
      )
      expect(res.status).toBe(200)
      expect(h.calls[0]!.pageToken).toBe('aGk_-$')
      expect('pageSize' in h.calls[0]!).toBe(false)
    } finally {
      await h.stop()
    }
  })

  test('D 畸形 pageSize → 400 invalidRequest（host 预验 fail-closed，逐形）', async () => {
    const h = await startHarness()
    try {
      for (const raw of ['abc', '', '-1', '1.5', '1e3', '+7', ' 7', '7 ']) {
        const res = await get(h, `/sessions/sess-1/replay?scopeId=main&pageSize=${encodeURIComponent(raw)}`)
        expect(res.status, `pageSize=${JSON.stringify(raw)}`).toBe(400)
        const body = (await res.json()) as { kind: string; error: { code: string } }
        expect(body.kind).toBe('error')
        expect(body.error.code).toBe('invalidRequest')
      }
      expect(h.calls).toHaveLength(0) // 预验拒绝，零 runtime 触达
    } finally {
      await h.stop()
    }
  })

  test('E 错误映射对表：invalidRequest/cursorExpired→400、resourceLimit→429、scopeDenied→403、notFound→404', async () => {
    const h = await startHarness()
    try {
      const cases: Array<{ code: string; status: number }> = [
        { code: 'invalidRequest', status: 400 },
        { code: 'cursorExpired', status: 400 },
        { code: 'resourceLimit', status: 429 },
        { code: 'scopeDenied', status: 403 },
        { code: 'notFound', status: 404 },
      ]
      for (const { code, status } of cases) {
        h.respondWith(() => {
          throw { code, message: code } // 契约错误分态 = code 载体形
        })
        const res = await get(h, `/sessions/sess-1/replay?scopeId=main&pageSize=5`)
        expect(res.status, `code=${code}`).toBe(status)
        const body = (await res.json()) as { kind: string; error: { code: string } }
        expect(body.kind).toBe('error')
        expect(body.error.code, `code=${code}`).toBe(code) // body code 区分（400 双态）
      }
    } finally {
      await h.stop()
    }
  })

  test('F hasMore/nextPageToken 加性透传（envelope 加性字段零剥离）', async () => {
    const h = await startHarness()
    try {
      h.respondWith(() => ({
        of: 'replaySession',
        projection: {
          sessionId: 'sess-1',
          productId: 'atlascode',
          scopeId: 'main',
          semantics: 'persisted-effective-conversation',
          messages: [],
          truncated: false,
        },
        hasMore: true,
        nextPageToken: 'tok-1',
      }))
      const res = await get(h, '/sessions/sess-1/replay?scopeId=main')
      expect(res.status).toBe(200)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.hasMore).toBe(true)
      expect(body.nextPageToken).toBe('tok-1')
    } finally {
      await h.stop()
    }
  })
})
