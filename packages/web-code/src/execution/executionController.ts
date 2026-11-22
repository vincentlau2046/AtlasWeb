// B 附表 §3 —— web-code 执行通道（排队、取消、审批的客户端面）。
// 职责边界（合同 §2/§4/§5/§8 对表）：
//  - UI 状态只读投影 + 命令发送；queue/approval 状态机在上游内核，
//    AtlasWeb 零自建裁判、零重复执法（上限/超时 300s 全归服务端）。
//  - decide bind 必含 turnId 且 ≡ 归属 turn（必改②客户端侧 fail-closed）：
//    归属 turnId 只取自 approval.requested 事件 bind，本地不推断；未知
//    approvalId → 硬错零派发。
//  - actorId 展示值取自 approval.settled 事件（f4 S2 抽验裁定），不本地推断。
//  - 事件 id 去重 + cursor 单调记录 + 断线 reconnect() 续传（E6 语义，
//    手动恢复面，与会话 follow retry() 同形）。
//  - queue.updated 事件不消费（payload.depth 单值无法重建 turnIds；turn 域
//    事件已充分——与 host 侧队列投影同裁定）。
//  - probe=off / 未授权 → 零渲染（视图层 Composer 返回 null，非 disabled 占位）。
// transport 注入形：单测 fake 与浏览器 HTTP 真体（createHttpExecutionTransport）
// 共面；零 ambient fetch。
/** workspace+session 绑定（bind 三元组的客户端源；null = 执行面未绑定）。 */
export interface ExecutionBinding {
  workspaceId: string
  sessionId: string
}

/** 命令/事件流 transport（注入 seam）。 */
export interface ExecutionTransport {
  post(path: string, body: unknown): Promise<{ status: number; body: unknown }>
  openEventStream(opts: {
    workspaceId: string
    sessionId: string
    cursor?: string
    signal: AbortSignal
  }): AsyncIterable<unknown>
}

export type ExecutionPhase = 'idle' | 'probing' | 'ready' | 'disabled' | 'error'
export type ExecutionDecision = 'approved' | 'denied'
export type SettledDecision = 'approved' | 'denied' | 'expired' | 'voidedByCancel'

/** 客户端队列投影 VM（纯投影；上游 kernel 权威）。 */
export interface ExecutionQueueVM {
  runningTurnId: string | null
  queuedTurnIds: string[]
}

export interface PendingApprovalVM {
  approvalId: string
  turnId: string
}

export interface SettledApprovalVM {
  approvalId: string
  turnId: string
  decision: SettledDecision
  actorId: string
  timestamp: number
}

export interface ExecutionStatusModel {
  phase: ExecutionPhase
  error?: { code: string; message: string }
  /** 流级错误（命令面失败不经此——命令错误由调用方捕获）。 */
  streamError?: { code: string; message: string }
  queue: ExecutionQueueVM
  pendingApprovals: PendingApprovalVM[]
  settledApprovals: SettledApprovalVM[]
  /** 事件 cursor（单调；reconnect 续传源）。 */
  lastCursor: string | null
}

/** 可写观察源（controller.ts Source 同构最小面）。 */
interface WritableSource<T> {
  getSnapshot(): T
  set(next: T): void
  subscribe(fn: () => void): () => void
}

const emptyStatus = (): ExecutionStatusModel => ({
  phase: 'idle',
  queue: { runningTurnId: null, queuedTurnIds: [] },
  pendingApprovals: [],
  settledApprovals: [],
  lastCursor: null,
})

/** v0 信封公共段（id=UUID、ts 信息性；schema 权威在服务端 strictObject）。 */
const envelope = () => ({ v: 0, id: crypto.randomUUID(), ts: Date.now() })

/**
 * 执行通道控制器：probe → 就绪后开执行事件流，事件投影入可观察状态，
 * 四写命令（submit/cancel/remove/decide）经 transport 派发。
 * 一个实例任一时刻至多一条活跃事件流（attach/reconnect 先 abort 旧流）。
 */
export class ExecutionController {
  readonly status: import('@atlasweb/web-store').ObservableSnapshot<ExecutionStatusModel>

  private readonly model: WritableSource<ExecutionStatusModel>
  private readonly seenEventIds = new Set<string>()
  private streamAbort: AbortController | undefined
  private lastSubmit: { submitId: string; text: string } | undefined

  constructor(
    private readonly transport: ExecutionTransport,
    private readonly options: { binding(): ExecutionBinding | null },
  ) {
    // Source 形与 controller.ts 同构（HostObservable 契约）——局部最小复刻，
    // 不为 20 行引入跨模块导出面。
    let snapshot = emptyStatus()
    const listeners = new Set<() => void>()
    this.model = {
      getSnapshot: () => snapshot,
      set: (next) => {
        snapshot = next
        for (const listener of listeners) listener()
      },
      subscribe: (fn: () => void) => {
        listeners.add(fn)
        return () => {
          listeners.delete(fn)
        }
      },
    }
    this.status = this.model
  }

  /** 重新绑定并探活：abort 在途流 → probe → ready 即开流（绑定变更入口）。 */
  async attach(): Promise<void> {
    this.streamAbort?.abort()
    this.streamAbort = undefined
    const binding = this.options.binding()
    if (binding === null) {
      this.model.set({ ...emptyStatus(), phase: 'disabled' })
      return
    }
    this.model.set({ ...emptyStatus(), phase: 'probing' })
    let body: unknown
    try {
      const res = await this.transport.post('/execution/probe', {
        ...envelope(),
        type: 'capability.probe',
        bind: { workspaceId: binding.workspaceId, sessionId: binding.sessionId },
        payload: {},
      })
      if (res.status !== 200) {
        this.model.set({ ...emptyStatus(), phase: 'error', error: { code: 'probeFailed', message: `HTTP ${res.status}` } })
        return
      }
      body = res.body
    } catch (error) {
      this.model.set({ ...emptyStatus(), phase: 'error', error: { code: 'probeFailed', message: String(error) } })
      return
    }
    const probe = body as { enabled?: unknown }
    if (probe?.enabled !== true) {
      this.model.set({ ...emptyStatus(), phase: 'disabled' })
      return
    }
    this.model.set({ ...emptyStatus(), phase: 'ready' })
    this.startStream(binding)
  }

  /** 提交回合：submitId 客户端产一次（UUID）；reuse=true 复用上一次（E3 幂等重试）。 */
  async submit(text: string, opts?: { reuseLastSubmitId?: boolean }): Promise<{ submitId: string }> {
    const binding = this.requireReady()
    const reuse = opts?.reuseLastSubmitId === true && this.lastSubmit !== undefined
    const submitId = reuse ? this.lastSubmit!.submitId : crypto.randomUUID()
    this.lastSubmit = { submitId, text }
    await this.transport.post('/execution/turn.submit', {
      ...envelope(),
      type: 'turn.submit',
      bind: { workspaceId: binding.workspaceId, sessionId: binding.sessionId },
      payload: { submitId, text },
    })
    return { submitId }
  }

  /** 运行中取消（kernel 落 cancelled 终态）。 */
  async cancel(turnId: string): Promise<void> {
    const binding = this.requireReady()
    await this.transport.post('/execution/turn.cancel', {
      ...envelope(),
      type: 'turn.cancel',
      bind: { workspaceId: binding.workspaceId, sessionId: binding.sessionId },
      payload: { targetTurnId: turnId },
    })
  }

  /** 排队中移除 ≡ turn.cancel(queued)：cancelled 终态，不静默移除。 */
  async remove(turnId: string): Promise<void> {
    const binding = this.requireReady()
    await this.transport.post('/execution/queue.remove', {
      ...envelope(),
      type: 'queue.remove',
      bind: { workspaceId: binding.workspaceId, sessionId: binding.sessionId },
      payload: { targetTurnId: turnId },
    })
  }

  /**
   * 审批决定：bind.turnId 必含且 ≡ approval.requested 归属 turn（必改②）。
   * 归属只取自事件 bind；未知 approvalId → 硬错零派发（fail-closed）。
   */
  async decide(approvalId: string, decision: ExecutionDecision): Promise<void> {
    const binding = this.requireReady()
    const pending = this.model.getSnapshot().pendingApprovals.find(p => p.approvalId === approvalId)
    if (pending === undefined) {
      throw new Error(`approval "${approvalId}" is not pending — decide requires the owning turn binding (zero dispatch)`)
    }
    await this.transport.post('/execution/approval.decide', {
      ...envelope(),
      type: 'approval.decide',
      bind: { workspaceId: binding.workspaceId, sessionId: binding.sessionId, turnId: pending.turnId },
      payload: { approvalId, decision },
    })
  }

  /** 断线手动重连：以 lastCursor 续传（恰一次语义由服务端 cursor 权威）。 */
  reconnect(): void {
    const binding = this.options.binding()
    if (binding === null || this.model.getSnapshot().phase !== 'ready') return
    this.streamAbort?.abort()
    this.startStream(binding)
  }

  /** 终止事件流（dispose 面；绑定状态保留）。 */
  dispose(): void {
    this.streamAbort?.abort()
    this.streamAbort = undefined
  }

  private requireReady(): ExecutionBinding {
    if (this.model.getSnapshot().phase !== 'ready') {
      throw new Error('execution channel is not ready (probe first)')
    }
    const binding = this.options.binding()
    if (binding === null) throw new Error('execution channel has no binding')
    return binding
  }

  private startStream(binding: ExecutionBinding): void {
    const ac = new AbortController()
    this.streamAbort = ac
    void this.pump(binding, ac.signal, ac)
  }

  private async pump(binding: ExecutionBinding, signal: AbortSignal, ac: AbortController): Promise<void> {
    const cursor = this.model.getSnapshot().lastCursor
    try {
      for await (const frame of this.transport.openEventStream({
        workspaceId: binding.workspaceId,
        sessionId: binding.sessionId,
        ...(cursor !== null ? { cursor } : {}),
        signal,
      })) {
        if (ac.signal.aborted || ac !== this.streamAbort) return // 被新流取代
        this.applyFrame(frame, binding)
      }
      if (ac === this.streamAbort && !ac.signal.aborted) {
        // 服务端正常关流：明示断流面（不静默假活）。
        const s = this.model.getSnapshot()
        this.model.set({ ...s, streamError: { code: 'streamClosed', message: 'execution event stream closed' } })
      }
    } catch (error) {
      if (ac.signal.aborted || ac !== this.streamAbort) return
      const s = this.model.getSnapshot()
      this.model.set({ ...s, streamError: { code: 'streamFailed', message: String(error) } })
    }
  }

  /** 帧 = replay 三态 control 帧（kind/headCursor）或事件帧（type/cursor）。 */
  private applyFrame(frame: unknown, binding: ExecutionBinding): void {
    const rec = frame as Record<string, unknown>
    if (rec === null || typeof rec !== 'object') return
    if (rec.kind === 'baseline' || rec.kind === 'delta' || rec.kind === 'expired') {
      const events = Array.isArray(rec.events) ? rec.events : []
      for (const event of events) this.applyEvent(event, binding)
      if (typeof rec.headCursor === 'string') this.patch({ lastCursor: rec.headCursor })
      return
    }
    this.applyEvent(frame, binding)
  }

  private applyEvent(event: unknown, binding: ExecutionBinding): void {
    const rec = event as Record<string, unknown>
    if (rec === null || typeof rec !== 'object' || typeof rec.type !== 'string') return
    const id = typeof rec.id === 'string' ? rec.id : null
    if (id === null || this.seenEventIds.has(id)) return // 恰一次（id 去重）
    this.seenEventIds.add(id)
    // bind 精确投递：不属于当前绑定的事件零消费。
    const eventBind = rec.bind as Record<string, unknown> | undefined
    if (eventBind?.workspaceId !== binding.workspaceId || eventBind?.sessionId !== binding.sessionId) return
    const cursor = typeof rec.cursor === 'string' ? rec.cursor : null
    const turnId = typeof eventBind?.turnId === 'string' ? eventBind.turnId : null
    const s = this.model.getSnapshot()
    const queue = { runningTurnId: s.queue.runningTurnId, queuedTurnIds: [...s.queue.queuedTurnIds] }
    let pending = s.pendingApprovals
    let settled = s.settledApprovals
    switch (rec.type) {
      case 'turn.accepted':
        if (turnId !== null && !queue.queuedTurnIds.includes(turnId) && queue.runningTurnId !== turnId) {
          queue.queuedTurnIds.push(turnId)
        }
        break
      case 'turn.started':
        if (turnId !== null) {
          queue.runningTurnId = turnId
          queue.queuedTurnIds = queue.queuedTurnIds.filter(t => t !== turnId)
        }
        break
      case 'turn.completed':
      case 'turn.failed':
      case 'turn.cancelled':
        if (turnId !== null) {
          if (queue.runningTurnId === turnId) queue.runningTurnId = null
          queue.queuedTurnIds = queue.queuedTurnIds.filter(t => t !== turnId)
        }
        break
      case 'approval.requested': {
        const approvalId = (rec.payload as Record<string, unknown> | undefined)?.approvalId
        if (typeof approvalId === 'string' && turnId !== null && !pending.some(p => p.approvalId === approvalId)) {
          pending = [...pending, { approvalId, turnId }]
        }
        break
      }
      case 'approval.settled': {
        const payload = rec.payload as Record<string, unknown> | undefined
        const approvalId = payload?.approvalId
        const decision = payload?.decision
        const actorId = payload?.actorId
        const timestamp = payload?.timestamp
        if (typeof approvalId === 'string') {
          pending = pending.filter(p => p.approvalId !== approvalId)
          if (
            (decision === 'approved' || decision === 'denied' || decision === 'expired' || decision === 'voidedByCancel')
            && typeof actorId === 'string' && typeof timestamp === 'number'
          ) {
            settled = [...settled, { approvalId, turnId: turnId ?? '', decision, actorId, timestamp }]
          }
        }
        break
      }
      case 'turn.delta':
      case 'queue.updated':
      case 'error':
        // turn.delta：文本流归会话视图（本切片零消费）；queue.updated：depth
        // 单值不重建 turnIds（同 host 投影裁定）；error 事件经 streamError 面。
        if (rec.type === 'error') {
          const payload = rec.payload as { error?: { code?: unknown; message?: unknown } } | undefined
          const e = payload?.error
          this.model.set({
            ...s,
            queue,
            pendingApprovals: pending,
            settledApprovals: settled,
            ...(cursor !== null ? { lastCursor: cursor } : {}),
            streamError: { code: typeof e?.code === 'string' ? e.code : 'unknown', message: typeof e?.message === 'string' ? e.message : 'execution error event' },
          })
          return
        }
        break
      default:
        return // 未知事件类型零消费（strictObject 服务端权威）
    }
    this.model.set({
      ...s,
      queue,
      pendingApprovals: pending,
      settledApprovals: settled,
      ...(cursor !== null ? { lastCursor: cursor } : {}),
    })
  }

  private patch(partial: Partial<ExecutionStatusModel>): void {
    this.model.set({ ...this.model.getSnapshot(), ...partial })
  }
}

/**
 * 浏览器 HTTP 真体 transport：POST JSON 命令 + GET SSE 事件流
 * （`data: <json>\n\n` 帧；fetch ReadableStream 解析，signal abort 断流）。
 */
export function createHttpExecutionTransport(options: {
  baseUrl: string
  fetch?: typeof fetch
  headers?: Record<string, string>
}): ExecutionTransport {
  const doFetch = options.fetch ?? fetch.bind(globalThis)
  const baseHeaders = options.headers ?? {}
  const url = (path: string, params?: Record<string, string>): string => {
    const u = new URL(options.baseUrl.replace(/\/$/, '') + path)
    if (params !== undefined) {
      for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
    }
    return u.toString()
  }
  return {
    async post(path, body) {
      const res = await doFetch(url(path), {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...baseHeaders },
        body: JSON.stringify(body),
      })
      const text = await res.text()
      let parsed: unknown = null
      if (text.length > 0) {
        try {
          parsed = JSON.parse(text)
        } catch {
          parsed = { raw: text }
        }
      }
      return { status: res.status, body: parsed }
    },
    async *openEventStream(opts) {
      const params: Record<string, string> = { workspaceId: opts.workspaceId, sessionId: opts.sessionId }
      if (opts.cursor !== undefined) params.cursor = opts.cursor
      const res = await doFetch(url('/execution/events', params), {
        headers: { accept: 'text/event-stream', ...baseHeaders },
        signal: opts.signal,
      })
      if (!res.ok || res.body === null) {
        throw new Error(`execution event stream failed: HTTP ${res.status}`)
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) return
        buf += decoder.decode(value, { stream: true })
        let sep: number
        while ((sep = buf.indexOf('\n\n')) >= 0) {
          const raw = buf.slice(0, sep)
          buf = buf.slice(sep + 2)
          for (const line of raw.split('\n')) {
            if (!line.startsWith('data:')) continue
            const payload = line.slice(5).trim()
            if (payload.length === 0) continue
            try {
              yield JSON.parse(payload) as unknown
            } catch {
              // 非 JSON data 行跳过（keep-alive 注释帧等）。
            }
          }
        }
      }
    },
  }
}
