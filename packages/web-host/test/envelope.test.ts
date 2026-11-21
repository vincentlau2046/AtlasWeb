import { describe, expect, test } from 'bun:test'

// ⑥-B（e2e P2 扩大定谳）：HTTP 响应面 envelope 化——对照发布契约
// WebSessionSuccessSchema / WebSessionErrorResponseSchema 严格 parse：
// 成功形 = {of, schemaVersion:0, requestId:UUID, productId, scopeId,
// kind:'response', ...payload}；错误形 = {schemaVersion, requestId,
// productId, scopeId, kind:'error', error{code,message}}。
// follow SSE 帧面已符合 WebSessionEventSchema（上游单源），不在本格。
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ListSessionsSuccessSchema,
  SearchSessionsSuccessSchema,
  ReplaySessionSuccessSchema,
  WebSessionErrorResponseSchema,
} from '@atlaswork/atlascode/web-contract'

const HOST = '127.0.0.1'
const PORT = 8951

async function startServer() {
  const { createHttpHost } = await import('../src/httpHost')
  const { createSessionHost } = await import('../src/sessionHost')
  const { createLaunchAuth } = await import('../src/auth')
  const dir = mkdtempSync(join(tmpdir(), 'atlasweb-env-'))
  writeFileSync(join(dir, 's1.jsonl'), [
    JSON.stringify({ type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2026-11-16T08:00:00.000Z', message: { role: 'user', content: 'envelope probe text' } }),
  ].join('\n') + '\n')
  const sessionHost = createSessionHost({ productId: 'atlascode', scopes: [{ scopeId: 'main', storageDir: dir }] })
  const auth = createLaunchAuth({ secret: 'envelope-test-secret-32-bytes!!!!!!' })
  const server = createHttpHost({ sessionHost, auth, productId: 'atlascode' })
  await new Promise<void>(resolve => server.listen(PORT, HOST, resolve))
  await sessionHost.start()
  const cookie = auth.redeemLaunchToken(auth.issueLaunchToken())!
  return { base: `http://${HOST}:${PORT}`, cookie, async stop() { await new Promise<void>(r => server.close(() => r())); await sessionHost.close(); rmSync(dir, { recursive: true, force: true }) } }
}

describe('⑥-B: HTTP response envelope (published contract strict-parse)', () => {
  test('list/search/replay strict-parse; error paths parse as WebSessionErrorResponse', async () => {
    const ctx = await startServer()
    try {
      const headers = { host: `${HOST}:${PORT}`, cookie: `atlas_session=${ctx.cookie}` }
      // list
      const list = await (await fetch(`${ctx.base}/sessions?scopeId=main`, { headers })).json()
      const lp = ListSessionsSuccessSchema.safeParse(list)
      expect(lp.success, `list envelope: ${JSON.stringify(lp.success ? {} : (lp as { error?: { issues: unknown[] } }).error?.issues)}`).toBe(true)
      // search
      const search = await (await fetch(`${ctx.base}/sessions/search?q=envelope%20probe&scopeId=main`, { headers })).json()
      const sp = SearchSessionsSuccessSchema.safeParse(search)
      expect(sp.success, `search envelope: ${JSON.stringify(sp.success ? {} : (sp as { error?: { issues: unknown[] } }).error?.issues)}`).toBe(true)
      // replay
      const replay = await (await fetch(`${ctx.base}/sessions/s1/replay?scopeId=main`, { headers })).json()
      const rp = ReplaySessionSuccessSchema.safeParse(replay)
      expect(rp.success, `replay envelope: ${JSON.stringify(rp.success ? {} : (rp as { error?: { issues: unknown[] } }).error?.issues)}`).toBe(true)
      // error paths：scopeDenied 403 与 notFound 404 均为契约错误 envelope
      const denied = await (await fetch(`${ctx.base}/sessions?scopeId=other`, { headers })).json()
      expect(WebSessionErrorResponseSchema.safeParse(denied).success).toBe(true)
      const missing = await (await fetch(`${ctx.base}/sessions/nope/replay?scopeId=main`, { headers })).json()
      expect(WebSessionErrorResponseSchema.safeParse(missing).success).toBe(true)
    } finally {
      await ctx.stop()
    }
  })
})
