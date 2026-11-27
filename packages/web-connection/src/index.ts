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
// - 流异常终止（未达 closed 即断）→ 有界重连（默认 3 次，backoff 后持最近
//   交付的 cursor 增量续接——A4 有效 cursor 续接；失效 cursor 由服务端
//   resetRequired 信号清空重开）；预算耗尽 → 合成 `error`(connectionLost) +
//   `closed` 终态对交付（合成帧为适配器层语义，与协议 error→closed 成对形
//   一致）。
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

/** A4 连接状态面：UI「正在连接/在线跟随/重连中/无法恢复可重试」的原始信号。 */
export type AtlasFollowState = 'connecting' | 'live' | 'reconnecting' | 'ended'

export interface AtlasFollowHandle {
  /** 协议事件流（closed 终态或 abort 后结束；resetRequired 透传后同流续上）。 */
  events: AsyncIterable<AtlasSessionEvent>
  /** A4 连接状态（duck-typed HostObservable 形：getSnapshot + subscribe）。 */
  state: { getSnapshot(): AtlasFollowState; subscribe(fn: () => void): () => void }
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
  // F6-PAGE S2：可选分页键加性扩面（pageToken opaque / pageSize host
  // 预验域——connection 只做 URL 拼接透传）。
  replaySession(sessionId: string, opts?: { scopeId?: string; pageSize?: number; pageToken?: string }): Promise<{
    projection: Record<string, unknown>
    hasMore?: boolean
    nextPageToken?: string
  }>
  follow(sessionId: string, opts?: AtlasFollowOptions): AtlasFollowHandle
  /**
   * B3 收尾波工单增量①：只读 workspace 发现列表（GET /execution/workspaces）。
   * /execution 路由族 = 裸 JSON（非 envelope）；响应仅 workspaceId 字符串——
   * 表外形状（越界字段/缺字段/非串/非数组）fail-closed → invalidRequest。
   * 可见性 ≠ 授权：选择不预授任何提交权（服务端逐命令对表）。
   */
  listWorkspaces(): Promise<{ workspaces: Array<{ workspaceId: string }> }>
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
    // raw 非空但解析未命中（Node 面 cookie 名漂移形）→ fail-closed 即时
    // throw，不静默落 ambient（Node 无 jar → 全部请求延迟 401 零报错形；
    // Atlas-reveiw hardening，2026-11-20）。
    if (raw.length > 0) {
      throw new AtlasConnectionError('redeem response set-cookie carried no atlas_session cookie', 'invalidRequest')
    }
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
    // A4 状态面（duck-typed HostObservable）：connecting → live/reconnecting
    // 循环 → ended（终态含 abort）。控制器据「重连中」映射 UI 徽标。
    let followState: AtlasFollowState = 'connecting'
    const stateListeners = new Set<() => void>()
    const setState = (next: AtlasFollowState): void => {
      if (followState === next) return
      followState = next
      for (const listener of stateListeners) listener()
    }
    const finish = () => {
      if (finished) return
      finished = true
      setState('ended')
      resolveDone()
    }
    /** 预算耗尽的合成终态对（适配器层语义，与协议 error→closed 成对形一致；
     *  A4 e2e 定谳：error 帧形必须是协议嵌套形 error:{code,message}——顶层
     *  code 会被投影判为 unknown 错误码，丢失 connectionLost 语义）。 */
    const terminal = (message: string): AtlasSessionEvent[] => [
      { kind: 'error', error: { code: 'connectionLost', message } },
      { kind: 'closed' },
    ]

    async function* eventStream(): AsyncGenerator<AtlasSessionEvent> {
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
            setState('reconnecting')
            await sleep(backoffMs, controller.signal)
            continue
          }
          if (!res.ok || !res.body) {
            // fail-closed：非 SSE 响应按异常断流形走有界重连，不无限重试。
            controllers.delete(controller)
            if (reconnectsUsed >= maxReconnects) { yield* terminal(`follow HTTP ${res.status}`); return }
            reconnectsUsed += 1
            setState('reconnecting')
            await sleep(backoffMs, controller.signal)
            continue
          }
          setState('live')
          // 每响应新建 decoder：TextDecoder stream 态残留上一响应末尾的截断
          // 多字节序列（如 E4 BD），污染下一响应首帧解析（U+FFFD 前缀破坏
          // 'data:' 识别 → replacement 帧被静默丢弃）。
          const decoder = new TextDecoder()
          // outcome：closed=干净终态；abnormal=流异常终止/连续 reset（有界重连）。
          // resetRequired 不再是独立 outcome：cursor 已清，流就此终止走正常
          // 预算重连（无 cursor 重开 = 收敛到新 baseline）。
          let outcome: 'closed' | 'abnormal' = 'abnormal'
          let readError: unknown
          try {
            const reader = res.body.getReader()
            try {
              // 单环解析形：缓冲里有完整帧先解析（饿才 read）。resetRequired 后
              // 服务端契约是**同一条流**紧跟新 baseline（web-session-runtime
              // issueBaseline；流不结束）——若 resetRequired 后直接回到 read，
              // 同 chunk 已缓冲的 baseline 会被滞留到下一次 read（SSE 长连下
              // 永不就绪 → 消费者悬挂，A4 e2e 定谳）。
              let buffer = ''
              let closedArrived = false
              while (!closedArrived) {
                let separator = buffer.indexOf('\n\n')
                if (separator < 0) {
                  const { done: readDone, value } = await reader.read()
                  if (readDone) break
                  buffer += decoder.decode(value, { stream: true })
                  continue
                }
                const frame = buffer.slice(0, separator)
                buffer = buffer.slice(separator + 2)
                const data = parseFrameData(frame)
                if (data === undefined) continue
                let event: AtlasSessionEvent
                try {
                  event = JSON.parse(data) as AtlasSessionEvent
                } catch {
                  continue
                }
                if (event.kind === 'closed') {
                  if (aborted) return
                  yield event
                  outcome = 'closed'
                  closedArrived = true
                  break
                }
                if (event.kind === 'resetRequired') {
                  if (aborted) return
                  yield event
                  // 协议收敛形：清 cursor；同流续读（新 baseline 直达消费者）。
                  // 连续 resetRequired（无正常事件间隔）= 异常断流形：退出读环
                  // 走预算重连（防 server 环路打穿成无退避死循环）；单次 reset
                  // 后流终止也走预算重连（无 cursor 重开），不保留免预算形。
                  cursor = undefined
                  resetStreak += 1
                  if (resetStreak > 1) {
                    outcome = 'abnormal'
                    closedArrived = true
                    break
                  }
                  continue
                }
                resetStreak = 0
                // A4 有效 cursor 续接：协议事件携带 cursor（baseline/
                // replacement）即采样——异常重连以此为续接点（失效 cursor
                // 由服务端 resetRequired 信号清空重开，见上支）。
                const eventCursor = (event as { cursor?: unknown }).cursor
                if (typeof eventCursor === 'string' && eventCursor.length > 0) cursor = eventCursor
                if (aborted) return
                yield event
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
          if (reconnectsUsed >= maxReconnects) {
            yield* terminal(readError !== undefined ? `follow read failed: ${String(readError)}` : 'follow stream ended without closed')
            return
          }
          reconnectsUsed += 1
          setState('reconnecting')
          // A4：异常重连持最近交付的 cursor 增量续接（失效由 resetRequired
          // 信号清空——服务端契约面，不在适配器猜测）。
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
      state: {
        getSnapshot: (): AtlasFollowState => followState,
        subscribe: (fn: () => void): (() => void) => {
          stateListeners.add(fn)
          return () => { stateListeners.delete(fn) }
        },
      },
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
    replaySession: (sessionId, opts) => request(`sessions/${encodeURIComponent(sessionId)}/replay?scopeId=${encodeURIComponent(scope(opts))}${opts?.pageSize !== undefined ? `&pageSize=${opts.pageSize}` : ''}${opts?.pageToken ? `&pageToken=${encodeURIComponent(opts.pageToken)}` : ''}`),
    follow,
    async listWorkspaces() {
      const res = await doFetch(`${base}/execution/workspaces`, { headers: headers() })
      let body: unknown
      try {
        body = await res.json()
      } catch {
        throw new AtlasConnectionError(`non-JSON response: HTTP ${res.status}`, 'httpError', res.status)
      }
      if (!res.ok) {
        const err = body as { error?: { code?: string; message?: string } }
        throw new AtlasConnectionError(
          err?.error?.message ?? `listWorkspaces failed: HTTP ${res.status}`,
          err?.error?.code ?? 'httpError',
          res.status,
        )
      }
      // fail-closed 形校验：{workspaces: [{workspaceId: string}]} 逐项核——
      // 越界字段（目录内容/凭据形）同样拒（响应仅 workspaceId 字符串契约）。
      const shape = body as { workspaces?: unknown }
      if (
        typeof shape !== 'object' || shape === null
        || !Array.isArray(shape.workspaces)
        || !shape.workspaces.every(entry =>
          typeof entry === 'object' && entry !== null
          && Object.keys(entry).length === 1
          && typeof (entry as { workspaceId?: unknown }).workspaceId === 'string'
          && ((entry as { workspaceId: string }).workspaceId).length > 0,
        )
      ) {
        throw new AtlasConnectionError('listWorkspaces: response shape violates the workspaceId-only contract', 'invalidRequest', res.status)
      }
      return { workspaces: shape.workspaces as Array<{ workspaceId: string }> }
    },
    async close() {
      for (const controller of controllers) controller.abort()
      controllers.clear()
    },
  }
}
