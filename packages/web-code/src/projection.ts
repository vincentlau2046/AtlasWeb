// T6-A Task 8: 投影适配器——carrier 事件→视图模型（Atlas seam 新码域）。
// 协议词汇 = 上游 webSessionV0（SSE follow 事件：baseline/replacement/
// resetRequired/error/closed；NeutralBlock = text|activity）。本适配器对协议
// 形作窄结构消费（不作 zod 全量校验——消费侧带宽对齐信封透传形），一切
// 畸形输入 fail-closed：跳过 + 就地标注（RF3），禁整视图崩溃、禁静默丢弃。
// 事件应用为纯函数（不可变——返回新模型）。

/** Renderable text block (view model). */
export interface TextBlockVM {
  kind: 'text'
  text: string
}

/** Renderable activity block (view model). */
export interface ActivityBlockVM {
  kind: 'activity'
  label: string
  status?: string
}

/** Fail-closed annotation block/message — a visible skip marker (RF3). */
export interface AnnotationVM {
  kind: 'annotation'
  reason: string
}

export type BlockVM = TextBlockVM | ActivityBlockVM | AnnotationVM

/** One renderable conversation message. */
export interface MessageVM {
  id: string
  role: 'user' | 'assistant' | 'system'
  createdAt: string | null
  blocks: BlockVM[]
}

/** Conversation model: the view's whole world. */
export interface ConversationModel {
  sessionId: string | null
  // F6-PAGE：'paging-walk' = 超帽分页行进中间态（replay → paging-walk → live）。
  status: 'idle' | 'replay' | 'paging-walk' | 'live' | 'reconnecting' | 'reset' | 'closed' | 'error'
  messages: MessageVM[]
  /** Skip annotations accumulated by fail-closed handling (RF3), in order. */
  annotations: Array<{ reason: string }>
  /** Error face when status is 'error'. */
  error?: { code: string; message: string }
  /** Annotation count mirror (cheap selector target). */
  annotationCount: number
  /** F6-PAGE 分页行进进度面（paging-walk 态由视图渲染行进指示）。 */
  paging?: { loaded: number; complete: boolean }
}

/** The empty model. */
export function emptyConversation(): ConversationModel {
  return { sessionId: null, status: 'idle', messages: [], annotations: [], annotationCount: 0 }
}

/** Roles the projection schema admits. */
const ROLES = new Set(['user', 'assistant', 'system'])

/** Narrow a projection message; undefined = malformed (caller annotates). */
function narrowMessage(raw: unknown): MessageVM | undefined {
  if (raw === null || typeof raw !== 'object') return undefined
  const record = raw as Record<string, unknown>
  if (typeof record.id !== 'string' || record.id.length === 0) return undefined
  if (typeof record.role !== 'string' || !ROLES.has(record.role)) return undefined
  if (!Array.isArray(record.blocks)) return undefined
  const blocks: BlockVM[] = []
  for (const block of record.blocks) {
    if (block !== null && typeof block === 'object') {
      const b = block as Record<string, unknown>
      if (b.kind === 'text' && typeof b.text === 'string') {
        blocks.push({ kind: 'text', text: b.text })
        continue
      }
      if (b.kind === 'activity' && typeof b.label === 'string') {
        blocks.push(typeof b.status === 'string' ? { kind: 'activity', label: b.label, status: b.status } : { kind: 'activity', label: b.label })
        continue
      }
    }
    blocks.push({ kind: 'annotation', reason: `skipped unknown block kind: ${describe(block)}` })
  }
  return {
    id: record.id,
    role: record.role as MessageVM['role'],
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : null,
    blocks,
  }
}

/** Short human-safe description of an unexpected value for annotation reasons. */
function describe(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  const t = typeof value
  if (t === 'object') {
    const kind = (value as Record<string, unknown>).kind
    return typeof kind === 'string' ? `object(kind=${kind})` : 'object'
  }
  return t
}

/** Narrowed projection: renderable messages plus fail-closed skip reasons. */
interface NarrowedProjection {
  messages: MessageVM[]
  skipped: string[]
}

/** Narrow a full projection payload; undefined = malformed (caller annotates). */
function narrowProjection(projection: unknown): NarrowedProjection | undefined {
  if (projection === null || typeof projection !== 'object') return undefined
  const record = projection as Record<string, unknown>
  if (!Array.isArray(record.messages)) return undefined
  const messages: MessageVM[] = []
  const skipped: string[] = []
  let malformed = 0
  record.messages.forEach((raw, index) => {
    const message = narrowMessage(raw)
    if (message === undefined) {
      malformed += 1
      skipped.push(`skipped malformed message at #${index}: ${describe(raw)}`)
      return
    }
    messages.push(message)
  })
  if (malformed > 0) {
    const reason = `skipped ${malformed} malformed message(s)`
    skipped.push(reason)
    messages.push({
      id: `annotation-${record.messages.length}-${malformed}`,
      role: 'system',
      createdAt: null,
      blocks: [{ kind: 'annotation', reason }],
    })
  }
  return { messages, skipped }
}

const withAnnotations = (model: ConversationModel, reasons: string[]): ConversationModel => {
  if (reasons.length === 0) return model
  const annotations = [...model.annotations, ...reasons.map(reason => ({ reason }))]
  return { ...model, annotations, annotationCount: annotations.length }
}

/**
 * Build a model from a replay payload (`{projection}` envelope already
 * stripped by the connection) or a bare projection. Malformed inputs fail
 * closed to an empty, annotated model — never a throw.
 * @param payload - replay payload or projection object.
 * @returns the conversation model (status 'replay').
 */
export function modelFromProjection(payload: unknown): ConversationModel {
  const bare = payload !== null && typeof payload === 'object' && Array.isArray((payload as Record<string, unknown>).messages)
  const projection = bare ? payload : payload !== null && typeof payload === 'object'
    ? (payload as Record<string, unknown>).projection
    : undefined
  const narrowed = narrowProjection(projection)
  if (narrowed === undefined) {
    const base = emptyConversation()
    return withAnnotations({ ...base, status: 'replay' }, [`malformed projection payload: ${describe(bare ? payload : projection)}`])
  }
  const sessionId = projection !== null && typeof projection === 'object'
    && typeof (projection as Record<string, unknown>).sessionId === 'string'
    ? (projection as Record<string, unknown>).sessionId as string
    : null
  return withAnnotations({ ...emptyConversation(), status: 'replay', sessionId, messages: narrowed.messages }, narrowed.skipped)
}

/**
 * F6-PAGE: merge one paged replay result into the existing model (增量
 * merge——分页结果并入，不重灌). Messages are appended in page order with
 * id-dedupe (无重无漏); malformed inputs fail closed (annotate, never
 * throw); the walk progress face is derived from hasMore.
 * @param model - the current model (messages loaded so far).
 * @param payload - paged replay payload `{projection, hasMore?, nextPageToken?}`.
 * @returns the next model (status 'paging-walk').
 */
export function mergeProjectionPage(model: ConversationModel, payload: unknown): ConversationModel {
  const record = payload !== null && typeof payload === 'object' ? payload as Record<string, unknown> : undefined
  const narrowed = narrowProjection(record?.projection)
  const hasMore = record?.hasMore === true
  if (narrowed === undefined) {
    return withAnnotations(
      { ...model, status: 'paging-walk', paging: { loaded: model.messages.length, complete: !hasMore } },
      [`malformed projection page: ${describe(record?.projection)}`],
    )
  }
  // 无重：按 id 去重（页间可能交付重叠除；页内原序保留）。
  const seen = new Set(model.messages.map(message => message.id))
  const appended: MessageVM[] = []
  for (const message of narrowed.messages) {
    if (seen.has(message.id)) continue
    seen.add(message.id)
    appended.push(message)
  }
  const sessionId = record?.projection !== null && typeof record.projection === 'object'
    && typeof (record.projection as Record<string, unknown>).sessionId === 'string'
    ? (record.projection as Record<string, unknown>).sessionId as string
    : model.sessionId
  const messages = appended.length > 0 ? [...model.messages, ...appended] : model.messages
  return withAnnotations(
    { ...model, status: 'paging-walk', sessionId, messages, paging: { loaded: messages.length, complete: !hasMore } },
    narrowed.skipped,
  )
}

/**
 * Apply one follow (SSE) event to the model. Unknown/malformed events are
 * skipped with an annotation; the model is never mutated in place.
 * @param model - current model.
 * @param event - carrier event (protocol passthrough shape).
 * @returns the next model.
 */
export function applyFollowEvent(model: ConversationModel, event: unknown): ConversationModel {
  if (event === null || typeof event !== 'object') {
    return withAnnotations(model, [`skipped malformed event: ${describe(event)}`])
  }
  const record = event as Record<string, unknown>
  const kind = record.kind
  if (typeof kind !== 'string') {
    return withAnnotations(model, [`skipped malformed event: ${describe(event)}`])
  }
  switch (kind) {
    case 'baseline':
    case 'replacement': {
      const narrowed = narrowProjection(record.projection)
      if (narrowed === undefined) {
        return withAnnotations(model, [`skipped ${kind} with malformed projection: ${describe(record.projection)}`])
      }
      const sessionId = (record.projection as Record<string, unknown> | null)?.sessionId
      // A baseline is a fresh authoritative state: prior annotations described
      // the superseded stream generation and clear with it. A replacement is a
      // same-generation delta: annotations accumulate.
      const fresh = kind === 'baseline'
      const prior = fresh ? [] : model.annotations
      return withAnnotations({
        ...model,
        status: 'live',
        messages: narrowed.messages,
        sessionId: typeof sessionId === 'string' ? sessionId : model.sessionId,
        annotations: prior,
        annotationCount: prior.length,
      }, narrowed.skipped)
    }
    case 'resetRequired': {
      const reason = typeof record.reason === 'string' ? record.reason : 'unspecified'
      return withAnnotations({ ...model, status: 'reset' }, [`resetRequired: ${reason}`])
    }
    case 'error': {
      const error = record.error
      const code = error !== null && typeof error === 'object' && typeof (error as Record<string, unknown>).code === 'string'
        ? (error as Record<string, unknown>).code as string
        : 'unknown'
      const message = error !== null && typeof error === 'object' && typeof (error as Record<string, unknown>).message === 'string'
        ? (error as Record<string, unknown>).message as string
        : 'unspecified error'
      return withAnnotations({ ...model, status: 'error', error: { code, message } }, [`stream error: ${code}`])
    }
    case 'closed':
      return { ...model, status: 'closed' }
    default:
      return withAnnotations(model, [`skipped unknown event kind: ${kind}`])
  }
}
