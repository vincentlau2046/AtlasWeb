// T6-A Task 8: web-code 控制器——四面对（list/search/replay/follow）消费
// AtlasConnection，维持可观察模型（ObservableSnapshot 形——web-slots
// HostObservable 契约）。follow 切换即 abort 在途流（RF4）；一切适配器
// fail-closed 语义经 projection.ts。
import type { AtlasConnection, AtlasConnectionError, AtlasFollowHandle } from '@atlasweb/web-connection'
import type { ObservableSnapshot } from '@atlasweb/web-store'
import { applyFollowEvent, emptyConversation, modelFromProjection, type ConversationModel } from './projection.ts'

/** One sidebar session row (structural slice of the session summary). */
export interface SessionRowVM {
  id: string
  title: string | null
  messageCount: number | null
  updatedAt: string
}

/** Session list model. */
export interface SessionListModel {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error?: { code: string; message: string }
  rows: SessionRowVM[]
}

/** One search hit. */
export interface SearchResultVM {
  sessionId: string
  messageId: string
  snippet: string
}

/** Search model. */
export interface SearchModel {
  status: 'idle' | 'loading' | 'ready' | 'error'
  query: string
  results: SearchResultVM[]
  error?: { code: string; message: string }
}

/** A2 打开目标：会话必带；搜索命中再带消息锚；A3 锚恢复再带偏移。 */
export interface OpenTarget {
  sessionId: string
  messageId?: string
  offsetPx?: number
}

/** A2 定位目标态：绑定目标与会话；generation 供重复命中重触发滚动。 */
export interface TargetMessageState {
  sessionId: string
  messageId: string
  generation: number
  /** A3 对齐偏移（锚恢复保持阅读位；缺省顶对齐）。 */
  offsetPx?: number
}

/** Structural session title state (web-layout session-face 契约形——duck-typed). */
export interface SessionTitleEntry {
  id: string
  title: string | null
  retainedBy: { mainView?: number }
}

export interface SessionTitleState {
  byId: Record<string, SessionTitleEntry>
}

/** Minimal observable source (HostObservable contract). */
class Source<T> implements ObservableSnapshot<T> {
  private snapshot: T
  private readonly listeners = new Set<() => void>()

  constructor(initial: T) {
    this.snapshot = initial
  }

  getSnapshot(): T {
    return this.snapshot
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  set(next: T): void {
    this.snapshot = next
    for (const listener of this.listeners) listener()
  }
}

/** Extract {code,message} from an adapter error without importing its class shape. */
function errorFace(error: unknown): { code: string; message: string } {
  const candidate = error as { code?: unknown; message?: unknown; status?: unknown } | null
  if (candidate !== null && typeof candidate === 'object') {
    const rawCode = typeof candidate.code === 'string' ? candidate.code : 'unknown'
    // A1 安装错误视图区分面：会话请求 401（httpHost 非 envelope 401 → 适配器
    // 'httpError' + status 401）提升为 'unauthorized' 专用码——视图据此渲染
    // 「重开链接」指引，与 boot 兑换失败恢复面（main.tsx）同词汇族。
    const is401 = candidate.status === 401
    return {
      code: is401 ? 'unauthorized' : rawCode,
      message: typeof candidate.message === 'string' ? candidate.message : String(error),
    }
  }
  return { code: 'unknown', message: String(error) }
}

/**
 * The web-code conversation controller. Owns the four faces over one
 * connection and the derived session title state; the entry plugin binds its
 * observables into the slot runtime.
 */
export class WebCodeController {
  readonly sessionList: ObservableSnapshot<SessionListModel>
  readonly searchState: ObservableSnapshot<SearchModel>
  readonly conversation: ObservableSnapshot<ConversationModel>
  readonly titleState: ObservableSnapshot<SessionTitleState>
  /** 选中会话 id（session scope 适配器的侧写源；null = 无选中）。 */
  readonly sessionId: ObservableSnapshot<string | null>
  /** A2 定位目标（null = 无；换会话即清——标记不跨会话泄露）。 */
  readonly targetMessage: ObservableSnapshot<TargetMessageState | null>

  private readonly list: Source<SessionListModel>
  private readonly searchModel: Source<SearchModel>
  private readonly model: Source<ConversationModel>
  private readonly titles: Source<SessionTitleState>
  private readonly sessionIdSource = new Source<string | null>(null)
  private readonly targetMessageSource = new Source<TargetMessageState | null>(null)
  private targetGeneration = 0
  private rows: SessionRowVM[] = []
  private currentSessionId: string | null = null
  private currentHandle: AtlasFollowHandle | undefined
  private pumpGeneration = 0
  private searchGeneration = 0

  constructor(private readonly connection: AtlasConnection) {
    this.list = new Source<SessionListModel>({ status: 'idle', rows: [] })
    this.searchModel = new Source<SearchModel>({ status: 'idle', query: '', results: [] })
    this.model = new Source<ConversationModel>(emptyConversation())
    this.titles = new Source<SessionTitleState>({ byId: {} })
    this.sessionList = this.list
    this.searchState = this.searchModel
    this.conversation = this.model
    this.sessionId = this.sessionIdSource
    this.titleState = this.titles
    this.targetMessage = this.targetMessageSource
  }

  /** Reload the session list (paged first page). */
  async refreshSessions(): Promise<void> {
    this.list.set({ ...this.list.getSnapshot(), status: 'loading' })
    try {
      const { sessions } = await this.connection.listSessions()
      this.rows = sessions.map(row => {
        const record = row as Record<string, unknown>
        return {
          id: String(record.sessionId),
          title: typeof record.title === 'string' ? record.title : null,
          messageCount: typeof record.messageCount === 'number' ? record.messageCount : null,
          updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : '',
        }
      })
      this.list.set({ status: 'ready', rows: this.rows })
      this.republishTitles()
    } catch (error) {
      const e = error as AtlasConnectionError
      this.list.set({ status: 'error', error: errorFace(e), rows: [] })
    }
  }

  /** Run a search; the latest call wins (generation guard). */
  async search(query: string): Promise<void> {
    const generation = ++this.searchGeneration
    this.searchModel.set({ status: 'loading', query, results: [] })
    try {
      const { results } = await this.connection.searchSessions(query)
      if (generation !== this.searchGeneration) return // a newer search superseded this one
      this.searchModel.set({
        status: 'ready',
        query,
        results: results.map(row => {
          const record = row as Record<string, unknown>
          return {
            sessionId: String(record.sessionId),
            messageId: String(record.messageId),
            snippet: typeof record.snippet === 'string' ? record.snippet : '',
          }
        }),
      })
    } catch (error) {
      if (generation !== this.searchGeneration) return
      this.searchModel.set({ status: 'error', query, results: [], error: errorFace(error) })
    }
  }

  /**
   * Open a session: abort any in-flight follow (RF4), load the replay
   * projection, then start the follow stream. Resolves once the stream is
   * live; stream events keep converging into the model in the background
   * (the pump runs detached under the generation guard).
   */
  async openSession(sessionId: string): Promise<void> {
    this.currentHandle?.abort()
    this.currentHandle = undefined
    const generation = ++this.pumpGeneration
    this.currentSessionId = sessionId
    this.sessionIdSource.set(sessionId)
    this.targetMessageSource.set(null) // A2：换会话即清定位目标（不跨会话泄露）
    this.republishTitles()
    this.model.set({ ...emptyConversation(), sessionId, status: 'replay' })
    let replayed: ConversationModel
    try {
      const { projection } = await this.connection.replaySession(sessionId)
      replayed = modelFromProjection({ projection })
    } catch (error) {
      if (generation === this.pumpGeneration) {
        this.model.set({ ...emptyConversation(), sessionId, status: 'error', error: errorFace(error), messages: [] })
      }
      return
    }
    if (generation !== this.pumpGeneration) return
    this.model.set({ ...replayed, sessionId })
    const handle = this.connection.follow(sessionId)
    this.currentHandle = handle
    // The follow stream is established: replay-only face ends here.
    this.model.set({ ...this.model.getSnapshot(), status: 'live' })
    void this.pumpFollow(handle, generation)
  }

  /**
   * A2: open a session (or reuse the open one) and bind a message target.
   * Without a messageId this is exactly openSession (and clears any target);
   * with one, the target is bound to the now-open session so the view can
   * scroll to it (unmounted → scroll to index → refine after measurement).
   */
  async openTarget(target: OpenTarget): Promise<void> {
    if (target.messageId === undefined) {
      await this.openSession(target.sessionId)
      return
    }
    if (this.currentSessionId !== target.sessionId) await this.openSession(target.sessionId)
    // 开启竞争下不落目标：openSession 后会话已被切换则丢弃（目标绑定会话）。
    if (this.currentSessionId !== target.sessionId) return
    this.targetMessageSource.set({
      sessionId: target.sessionId,
      messageId: target.messageId,
      generation: ++this.targetGeneration,
      ...(target.offsetPx !== undefined ? { offsetPx: target.offsetPx } : {}),
    })
  }

  /**
   * Background follow pump: apply stream events into the model until the
   * stream ends or a newer generation supersedes it.
   */
  private async pumpFollow(handle: AtlasFollowHandle, generation: number): Promise<void> {
    try {
      for await (const event of handle.events) {
        if (generation !== this.pumpGeneration) return // superseded mid-stream
        this.model.set(applyFollowEvent(this.model.getSnapshot(), event))
      }
    } catch {
      // The adapter synthesizes terminal error/closed pairs; a raw pump throw
      // (non-protocol) lands here fail-closed.
      if (generation === this.pumpGeneration) {
        this.model.set(applyFollowEvent(this.model.getSnapshot(), { kind: 'error', error: { code: 'connectionLost', message: 'follow pump failed' } }))
      }
    }
  }

  /** Tear down: abort the live stream and close the connection. */
  async dispose(): Promise<void> {
    this.pumpGeneration += 1
    this.currentHandle?.abort()
    this.currentHandle = undefined
    await this.connection.close()
  }

  /** Re-derive the title state from the current rows + retention. */
  private republishTitles(): void {
    const byId: Record<string, SessionTitleEntry> = {}
    for (const row of this.rows) {
      byId[row.id] = {
        id: row.id,
        title: row.title,
        retainedBy: { mainView: this.currentSessionId === row.id ? 1 : 0 },
      }
    }
    this.titles.set({ byId })
  }
}
