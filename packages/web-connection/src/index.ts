// T6-A Task 6: Atlas transport adapter —— AtlasWeb 消费侧对 web-host HTTP/SSE 面
// 的唯一接缝。四面（list/search/replay/follow）+ LaunchAuth redeem + fail-closed
// 有界重连。边界红线：`@atlasharness/*` 仅 web-host 可 import —— 本包零上游依赖，
// 事件/载荷形状为协议透传（信封剥离后原样交付，字段不作二次建模）。
//
// 协议对齐（web-host httpHost/followPump 源面）：
// - 信封：{kind:'response'|'error', error:{code,message}}；剥离信封元字段后
//   返回载荷本体；error 信封 → AtlasConnectionError（code 原样）。
// - SSE 帧：`data: <json>\n\n`；`closed` 恒唯一终态（error 后必跟 closed）。
// - `resetRequired` = cursor 无效信号：适配器透传消费者后**自动无 cursor 重开**
//   （收敛到新 baseline），同一事件流继续（Review Focus 1）。
// - 流异常终止（未达 closed 即断）→ 有界重连（默认 3 次，backoff 后无 cursor
//   重开——适配器不持有可续 cursor，收敛语义 = 新 baseline 重放）；预算耗尽 →
//   合成 `error`(connectionLost) + `closed` 终态对交付（合成帧为适配器层语义，
//   与协议 error→closed 成对形一致）。
// - abort：消费侧 `handle.abort()` 即刻终止（在途帧被代次守卫丢弃，done 后
//   iterator 恒终态——Review Focus 4 切换竞态面）。

/** Error envelope surface: code ∈ scopeDenied|resourceLimit|notFound|invalidRequest|… */
export class AtlasConnectionError extends Error {
  readonly code: string
  readonly status?: number

  constructor(message: string, code: string, status?: number) {
    super(message)
    this.name = 'AtlasConnectionError'
    this.code = code
    this.status = status
  }
}

/** 协议事件透传形（SSE `data:` JSON 原样，不作字段建模）。 */
export interface AtlasSessionEvent {
  kind: string
  [field: string]: unknown
}

export interface AtlasConnectionConfig {
  baseUrl: string
  /** LaunchAuth token → 自动 redeem 出 credential（cookie 值，走 Bearer 面）。 */
  launchToken?: string
  /** 预共享 credential（= atlas_session cookie 值；web-host readCredential 接受 Bearer）。 */
  credential?: string
  defaultScopeId?: string
  /** 测试注入面；默认全局 fetch。 */
  fetch?: typeof fetch
  /** 重连退避毫秒（默认 250）。 */
  backoffMs?: number
  /** 异常断流重连预算（默认 3；resetRequired 重开不受此预算限）。 */
  maxReconnects?: number
}

export interface AtlasFollowOptions {
  scopeId?: string
  resumeCursor?: string
}

export interface AtlasFollowHandle {
  /** 协议事件流（closed 终态或 abort 后结束；resetRequired 透传后同流续上）。 */
  events: AsyncIterable<AtlasSessionEvent>
  abort(): void
  /** 流终态（closed 送达、abort、或合成终态对）后 resolve。 */
  done: Promise<void>
}

export interface AtlasConnection {
  /** redeem 路径建立后的 credential（预共享路径 = 原值）。 */
  credential?: string
  listSessions(opts?: { scopeId?: string; pageToken?: string }): Promise<{
    sessions: Array<Record<string, unknown>>
    nextPageToken?: string
  }>
  searchSessions(query: string, opts?: { scopeId?: string }): Promise<{
    results: Array<Record<string, unknown>>
  }>
  replaySession(sessionId: string, opts?: { scopeId?: string }): Promise<{
    projection: Record<string, unknown>
  }>
  follow(sessionId: string, opts?: AtlasFollowOptions): AtlasFollowHandle
  close(): Promise<void>
}

const SESSION_COOKIE = 'atlas_session='

export async function connect(config: AtlasConnectionConfig): Promise<AtlasConnection> {
  const doFetch = config.fetch ?? fetch
  const backoffMs = config.backoffMs ?? 250
  const maxReconnects = config.maxReconnects ?? 3
  const base = config.baseUrl.replace(/\/+$/, '')

  let credential = config.credential
  if (credential === undefined) {
    if (config.launchToken === undefined) {
      throw new AtlasConnectionError('connect requires a launchToken or a pre-shared credential', 'invalidRequest')
    }
    credential = await redeem(config.launchToken)
  }

  async function redeem(token: string): Promise<string> {
    const res = await doFetch(`${base}/auth/redeem?token=${encodeURIComponent(token)}`)
    if (!res.ok) throw new AtlasConnectionError(`redeem failed: HTTP ${res.status}`, 'invalidRequest', res.status)
    // LaunchAuth 以 set-cookie 下发会话值（HttpOnly/SameSite=Strict/Path=/）；
    // 适配器面取值走 Bearer（web-host readCredential 等价面，零 cookie jar）。
    const cookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
    const raw = cookies.length > 0 ? cookies.join('\n') : (res.headers.get('set-cookie') ?? '')
    for (const line of raw.split('\n')) {
      const at = line.indexOf(SESSION_COOKIE)
      if (at >= 0) {
        const value = line.slice(at + SESSION_COOKIE.length).split(';')[0]!.trim()
        if (value.length > 0) return decodeURIComponent(value)
      }
    }
    // 浏览器面：set-cookie 为 forbidden response header（getSetCookie 恒空、
    // get('set-cookie') 恒 null）——cookie jar 已由浏览器存（同源 fetch 默认
    // 随发），credential 走 ambient cookie（headers() 零 Bearer；web-host
    // readCredential cookie 优先序兜住）。空串 = ambient face 哨兵。
    return ''
  }

  function headers(): Record<string, string> {
    // 空 credential（浏览器 ambient cookie 面）→ 零 Bearer 头，凭据随
    // cookie jar 同源自动携带；Node/E2E 面 Bearer 原样。
    if (credential.length === 0) return {}
    return { authorization: `Bearer ${credential}` }
  }

  async function request<T>(path: string): Promise<T> {
    const res = await doFetch(`${base}/${path.replace(/^\/+/, '')}`, { headers: headers() })
    let body: Record<string, unknown>
    try {
      body = await res.json() as Record<string, unknown>
    } catch {
      throw new AtlasConnectionError(`non-JSON response: HTTP ${res.status}`, 'httpError', res.status)
    }
    if (body.kind === 'error') {
      const err = body.error as { code?: string; message?: string } | undefined
      throw new AtlasConnectionError(err?.message ?? `request failed: HTTP ${res.status}`, err?.code ?? 'httpError', res.status)
    }
    if (body.kind !== 'response') {
      throw new AtlasConnectionError(`unexpected envelope kind: HTTP ${res.status}`, 'httpError', res.status)
    }
    const { of: _of, schemaVersion: _sv, requestId: _ri, productId: _pi, scopeId: _si, kind: _k, ...payload } = body
    return payload as T
  }

  function scope(opts?: { scopeId?: string }): string {
    return opts?.scopeId ?? config.defaultScopeId ?? 'main'
  }

  const controllers = new Set<AbortController>()

  function follow(sessionId: string, opts?: AtlasFollowOptions): AtlasFollowHandle {
    let aborted = false
    let finished = false
    let resolveDone!: () => void
    const done = new Promise<void>(resolve => { resolveDone = resolve })
    let activeController: AbortController | undefined
    const finish = () => {
      if (finished) return
      finished = true
      resolveDone()
    }
    /** 预算耗尽的合成终态对（适配器层语义，与协议 error→closed 成对形一致）。 */
    const terminal = (message: string): AtlasSessionEvent[] => [
      { kind: 'error', code: 'connectionLost', message },
      { kind: 'closed' },
    ]

    async function* eventStream(): AsyncGenerator<AtlasSessionEvent> {
      const decoder = new TextDecoder()
      try {
        let reconnectsUsed = 0
        let resetStreak = 0
        let cursor: string | undefined = opts?.resumeCursor
        while (true) {
          if (aborted) return
          const controller = new AbortController()
          activeController = controller
          controllers.add(controller)
          const params = new URLSearchParams({ scopeId: scope(opts) })
          if (cursor !== undefined) params.set('cursor', cursor)
          let res: Response
          try {
            res = await doFetch(`${base}/sessions/${encodeURIComponent(sessionId)}/follow?${params}`, { headers: headers(), signal: controller.signal })
          } catch (error) {
            controllers.delete(controller)
            if (aborted || controller.signal.aborted) return
            if (reconnectsUsed >= maxReconnects) { yield* terminal(`follow connect failed: ${String(error)}`); return }
            reconnectsUsed += 1
            await sleep(backoffMs, controller.signal)
            continue
          }
          if (!res.ok || !res.body) {
            // fail-closed：非 SSE 响应按异常断流形走有界重连，不无限重试。
            controllers.delete(controller)
            if (reconnectsUsed >= maxReconnects) { yield* terminal(`follow HTTP ${res.status}`); return }
            reconnectsUsed += 1
            await sleep(backoffMs, controller.signal)
            continue
          }
          // outcome：closed=干净终态；reset=resetRequired 后无 cursor 立即重开；
          // abnormal=流异常终止（有界重连）。
          let outcome: 'closed' | 'reset' | 'abnormal' = 'abnormal'
          let readError: unknown
          try {
            const reader = res.body.getReader()
            try {
              let buffer = ''
              let closedArrived = false
              while (!closedArrived) {
                const { done: readDone, value } = await reader.read()
                if (readDone) break
                buffer += decoder.decode(value, { stream: true })
                let separator = buffer.indexOf('\n\n')
                while (separator >= 0) {
                  const frame = buffer.slice(0, separator)
                  buffer = buffer.slice(separator + 2)
                  separator = buffer.indexOf('\n\n')
                  const data = parseFrameData(frame)
                  if (data === undefined) continue
                  let event: AtlasSessionEvent
                  try {
                    event = JSON.parse(data) as AtlasSessionEvent
                  } catch {
                    continue
                  }
                  if (event.kind === 'closed') {
                    yield event
                    outcome = 'closed'
                    closedArrived = true
                    break
                  }
                  if (event.kind === 'resetRequired') {
                    yield event
                    // 协议收敛形：无 cursor 立即重开；连续 resetRequired（无正常
                    // 事件间隔）视作异常断流形计入重连预算（防 server 环路）。
                    cursor = undefined
                    resetStreak += 1
                    outcome = resetStreak > 1 ? 'abnormal' : 'reset'
                    break
                  }
                  resetStreak = 0
                  if (aborted) return
                  yield event
                }
              }
            } finally {
              reader.cancel().catch(() => {})
            }
          } catch (error) {
            if (aborted || controller.signal.aborted) return
            readError = error
            outcome = 'abnormal'
          } finally {
            controllers.delete(controller)
          }
          if (aborted) return
          if (outcome === 'closed') return
          if (outcome === 'reset') continue // 立即重开（无退避）
          if (reconnectsUsed >= maxReconnects) {
            yield* terminal(readError !== undefined ? `follow read failed: ${String(readError)}` : 'follow stream ended without closed')
            return
          }
          reconnectsUsed += 1
          cursor = undefined
          await sleep(backoffMs, controller.signal)
        }
      } finally {
        controllers.delete(activeController!)
        activeController = undefined
        finish()
      }
    }

    const events: AsyncIterable<AtlasSessionEvent> = {
      [Symbol.asyncIterator]() { return eventStream() },
    }

    return {
      events,
      abort() {
        aborted = true
        activeController?.abort()
        if (!finished) finish() // 未起流即 abort：done 即刻 resolve
      },
      done,
    }
  }

  function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise(resolve => {
      const timer = setTimeout(resolve, ms)
      signal?.addEventListener('abort', () => { clearTimeout(timer); resolve() }, { once: true })
    })
  }

  function parseFrameData(frame: string): string | undefined {
    const lines: string[] = []
    for (const line of frame.split('\n')) {
      if (line.startsWith('data:')) lines.push(line.slice(5).replace(/^ /, ''))
    }
    if (lines.length === 0) return undefined
    return lines.join('\n')
  }

  return {
    credential,
    listSessions: opts => request(`sessions?scopeId=${encodeURIComponent(scope(opts))}${opts?.pageToken ? `&pageToken=${encodeURIComponent(opts.pageToken)}` : ''}`),
    searchSessions: (query, opts) => request(`sessions/search?scopeId=${encodeURIComponent(scope(opts))}&q=${encodeURIComponent(query)}`),
    replaySession: (sessionId, opts) => request(`sessions/${encodeURIComponent(sessionId)}/replay?scopeId=${encodeURIComponent(scope(opts))}`),
    follow,
    async close() {
      for (const controller of controllers) controller.abort()
      controllers.clear()
    },
  }
}
