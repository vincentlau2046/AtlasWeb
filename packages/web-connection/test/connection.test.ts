// T6-A Task 6: web-connection 契约腿（RED 先行）。
// fixture = 真 web-host（seeded transcript + LaunchAuth + HttpHost）+ connect()
// 真 HTTP/SSE 消费。判据 = plan Task 6 Step 1：
//   redeem → list/search/replay/follow 四面全断言；
//   Review Focus 1 = resetRequired 重连收敛腿；
//   Review Focus 4 = 切换 abort 竞态腿；
//   异常断流 = 有界 fail-closed 重连（fetch 注入腿）。
// fixture 经相对路径复用 web-host 包源（workspace 内源级复用，同 Task 2 先例）。
import { describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const HOST = '127.0.0.1'
const PORT = 8941

interface Fixture {
  base: string
  launchToken: string
  credential: string
  transcript: string
  stop(): Promise<void>
}

async function startFixture(): Promise<Fixture> {
  const { createHttpHost } = await import('../../web-host/src/httpHost')
  const { createSessionHost } = await import('../../web-host/src/sessionHost')
  const { createLaunchAuth } = await import('../../web-host/src/auth')
  const dir = mkdtempSync(join(tmpdir(), 'atlasweb-conn-'))
  const transcript = join(dir, 'sess-1.jsonl')
  writeFileSync(transcript, [
    JSON.stringify({ type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2026-11-16T08:00:00.000Z', message: { role: 'user', content: 'hi' } }),
  ].join('\n') + '\n')
  const sessionHost = createSessionHost({ productId: 'atlascode', scopes: [{ scopeId: 'main', storageDir: dir }] })
  const auth = createLaunchAuth({ secret: 'connection-test-secret-32-bytes!' })
  const server = createHttpHost({ sessionHost, auth })
  await new Promise<void>(resolve => server.listen(PORT, HOST, resolve))
  await sessionHost.start()
  // 双 token 分离：launchToken 留给适配器 redeem 腿（token 单次有效，预 redeem
  // 即重放 401——服务端设计行为）；credential 用独立 token 预换。
  const launchToken = auth.issueLaunchToken()
  const credential = auth.redeemLaunchToken(auth.issueLaunchToken())!
  return {
    base: `http://${HOST}:${PORT}`, launchToken, credential, transcript,
    async stop() {
      await new Promise<void>(resolve => server.close(() => resolve()))
      await sessionHost.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

async function loadAdapter(): Promise<{ connect: (config: Record<string, unknown>) => Promise<AtlasConnectionStub> }> {
  return await import('../src/index.ts') as never
}

interface FollowHandleStub {
  events: AsyncIterable<{ kind: string }>
  abort(): void
  done: Promise<void>
}

interface AtlasConnectionStub {
  credential?: string
  listSessions(opts?: Record<string, unknown>): Promise<{ sessions: Array<Record<string, unknown>> }>
  searchSessions(query: string, opts?: Record<string, unknown>): Promise<{ results: Array<Record<string, unknown>> }>
  replaySession(sessionId: string, opts?: Record<string, unknown>): Promise<{ projection: Record<string, unknown> }>
  follow(sessionId: string, opts?: Record<string, unknown>): FollowHandleStub
  close(): Promise<void>
}

/** 超时安全的事件收集：不悬挂（deadline 到即返回已收帧）。 */
async function collectKinds(handle: FollowHandleStub, max: number, ms: number): Promise<string[]> {
  const kinds: string[] = []
  const iter = handle.events[Symbol.asyncIterator]()
  while (kinds.length < max) {
    const r = await Promise.race([iter.next(), new Promise<'timeout'>(r2 => setTimeout(() => r2('timeout'), ms))])
    if (r === 'timeout' || r.done) break
    kinds.push(r.value.kind)
    if (r.value.kind === 'closed') break
  }
  return kinds
}

/** 超时安全的单事件读取（时序腿：追加前先等第一帧，不空等）。 */
async function nextEvent(iter: AsyncIterator<{ kind: string }>, ms: number): Promise<{ kind: string } | 'timeout' | 'done'> {
  const r = await Promise.race([iter.next(), new Promise<'timeout'>(r2 => setTimeout(() => r2('timeout'), ms))])
  if (r === 'timeout') return 'timeout'
  if (r.done) return 'done'
  return r.value
}

describe('web-connection: Atlas transport adapter (fixture host)', () => {
  let fixture: Fixture

  test('setup fixture', async () => {
    fixture = await startFixture()
  })

  test('redeem flow: launchToken → credential → list face returns seeded session', async () => {
    const { connect } = await loadAdapter()
    const conn = await connect({ baseUrl: fixture.base, launchToken: fixture.launchToken })
    expect(typeof conn.credential).toBe('string')
    expect(conn.credential!.length).toBeGreaterThan(10)
    const list = await conn.listSessions()
    expect(list.sessions.length).toBe(1)
    // 载荷透传形（信封剥离后原样）；messageCount/title 属上游 runtime 数据语义
    // （该 seed 下实测 null，web-host 套件已覆盖）——适配器不虚构。
    expect(list.sessions[0]).toMatchObject({ sessionId: 'sess-1', scopeId: 'main', productId: 'atlascode' })
    await conn.close()
  })

  test('pre-shared credential path (Bearer): list + replay faces', async () => {
    const { connect } = await loadAdapter()
    const conn = await connect({ baseUrl: fixture.base, credential: fixture.credential })
    const list = await conn.listSessions()
    expect(list.sessions[0]!.sessionId).toBe('sess-1')
    const replay = await conn.replaySession('sess-1')
    expect(replay.projection.semantics).toBe('persisted-effective-conversation')
    expect(replay.projection.messages[0]!.blocks[0]).toEqual({ kind: 'text', text: 'hi' })
    await conn.close()
  })

  test('search face: hit + invalid query surfaced as AtlasConnectionError(invalidRequest)', async () => {
    const { connect } = await loadAdapter()
    const conn = await connect({ baseUrl: fixture.base, credential: fixture.credential })
    const search = await conn.searchSessions('hi')
    expect(search.results.length).toBe(1)
    expect(search.results[0]).toMatchObject({ sessionId: 'sess-1', snippet: 'hi' })
    await expect(conn.searchSessions('')).rejects.toMatchObject({ code: 'invalidRequest' })
    await conn.close()
  })

  test('error envelopes surface as typed errors: unknown session replay → notFound', async () => {
    const { connect } = await loadAdapter()
    const conn = await connect({ baseUrl: fixture.base, credential: fixture.credential })
    await expect(conn.replaySession('no-such-session')).rejects.toMatchObject({ code: 'notFound' })
    await conn.close()
  })

  test('follow face: baseline first, append → replacement convergence, abort releases', async () => {
    const { connect } = await loadAdapter()
    const conn = await connect({ baseUrl: fixture.base, credential: fixture.credential })
    const handle = conn.follow('sess-1')
    const iter = handle.events[Symbol.asyncIterator]()
    const first = await nextEvent(iter, 5000)
    expect(first !== 'timeout' && first !== 'done' && first.kind).toBe('baseline')
    appendFileSync(fixture.transcript, JSON.stringify({ type: 'assistant', uuid: 'a1', parentUuid: 'u1', timestamp: '2026-11-16T08:00:05.000Z', message: { role: 'assistant', content: 'hello' } }) + '\n')
    const second = await nextEvent(iter, 5000)
    expect(second !== 'timeout' && second !== 'done' && second.kind).toBe('replacement')
    handle.abort()
    await handle.done
    await conn.close()
  })

  test('Review Focus 1: bogus cursor → resetRequired → adapter reopens cursor-less → consumer converges on baseline', async () => {
    const { connect } = await loadAdapter()
    const conn = await connect({ baseUrl: fixture.base, credential: fixture.credential })
    const handle = conn.follow('sess-1', { resumeCursor: 'bogus-cursor-value' })
    const iter = handle.events[Symbol.asyncIterator]()
    // 收敛形：resetRequired（协议帧，透传消费者）后同流续上 baseline（适配器自动无 cursor 重开）。
    const first = await nextEvent(iter, 5000)
    expect(first !== 'timeout' && first !== 'done' && first.kind).toBe('resetRequired')
    const second = await nextEvent(iter, 5000)
    expect(second !== 'timeout' && second !== 'done' && second.kind).toBe('baseline')
    handle.abort()
    await handle.done
    await conn.close()
  })

  test('Review Focus 4: switch abort race — superseded stream ends promptly, zero stale frames after abort', async () => {
    const { connect } = await loadAdapter()
    const conn = await connect({ baseUrl: fixture.base, credential: fixture.credential })
    const handleA = conn.follow('sess-1')
    const iterA = handleA.events[Symbol.asyncIterator]()
    const firstA = await nextEvent(iterA, 5000)
    expect(firstA !== 'timeout' && firstA !== 'done' && firstA.kind).toBe('baseline')
    // 追加使一帧在途，随即 abort + 切换 B
    appendFileSync(fixture.transcript, JSON.stringify({ type: 'user', uuid: 'u2', parentUuid: 'a1', timestamp: '2026-11-16T08:00:10.000Z', message: { role: 'user', content: 'switch' } }) + '\n')
    handleA.abort()
    await handleA.done
    const handleB = conn.follow('sess-1')
    const kindsB = await collectKinds(handleB, 1, 5000)
    expect(kindsB).toEqual(['baseline'])
    // A 在 abort+done 之后零帧送达（竞态面：在途帧必须被代次守卫丢弃）——done 后
    // iterator 恒终态，next() 立即 {done:true}。
    const stale = await Promise.race([iterA.next(), new Promise<'none'>(r => setTimeout(() => r('none'), 500))])
    expect(stale === 'none' || stale.done === true).toBe(true)
    handleB.abort()
    await handleB.done
    await conn.close()
  })

  test('abnormal stream end → bounded fail-closed reconnect (fetch injection)', async () => {
    let calls = 0
    const sse = (frames: unknown[]): Response => new Response(
      frames.map(f => `data: ${JSON.stringify(f)}\n\n`).join(''),
      { headers: { 'content-type': 'text/event-stream' } },
    )
    const injectedFetch = (async (input: string | URL | Request): Promise<Response> => {
      calls += 1
      if (String(input).includes('/follow')) {
        if (calls === 1) return new Response('data: {"kind":"baseline","baselineId":"x"}\n\ngarbage-end', { headers: { 'content-type': 'text/event-stream' } })
        return sse([{ kind: 'baseline', baselineId: 'y' }, { kind: 'closed' }])
      }
      return fetch(input)
    }) as typeof fetch
    const { connect } = await loadAdapter()
    const conn = await connect({ baseUrl: 'http://127.0.0.1:1', credential: 'unused', fetch: injectedFetch, backoffMs: 5 })
    const handle = conn.follow('s')
    // 第一流异常终止（无 closed）→ 重连 → 第二流 baseline + closed 成对终态
    const kinds = await collectKinds(handle, 5, 5000)
    expect(kinds).toEqual(['baseline', 'baseline', 'closed'])
    expect(calls).toBe(2)
    await conn.close()
  })

  test('give-up after budget: synthesized error → closed terminal pair', async () => {
    const injectedFetch = (async (input: string | URL | Request): Promise<Response> => {
      if (String(input).includes('/follow')) {
        return new Response('data: {"kind":"baseline","baselineId":"x"}\n\n', { headers: { 'content-type': 'text/event-stream' } })
      }
      return fetch(input)
    }) as typeof fetch
    const { connect } = await loadAdapter()
    const conn = await connect({ baseUrl: 'http://127.0.0.1:1', credential: 'unused', fetch: injectedFetch, backoffMs: 5, maxReconnects: 1 })
    const handle = conn.follow('s')
    const kinds = await collectKinds(handle, 5, 5000)
    expect(kinds).toEqual(['baseline', 'baseline', 'error', 'closed'])
    await conn.close()
  })

  test('no credential source → connect rejects', async () => {
    const { connect } = await loadAdapter()
    await expect(connect({ baseUrl: fixture.base })).rejects.toThrow(/credential/)
  })

  test('teardown fixture', async () => {
    await fixture.stop()
  })
})
