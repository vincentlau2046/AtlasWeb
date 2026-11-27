// T6-A Task 8 RED: 投影适配器腿——carrier 事件→视图模型，RF3 畸形事件 fail-closed。
// 协议形状 = 上游 webSessionV0（baseline/replacement/resetRequired/error/closed；
// NeutralBlock = text|activity），seeded fixtures 零上游导入（协议透传形）。
import { describe, expect, test } from 'bun:test'
import {
  applyFollowEvent, emptyConversation, mergeProjectionPage, modelFromProjection,
  type ConversationModel,
} from '../src/projection.ts'

/** A valid seeded NeutralProjection (webSessionV0 projection shape). */
function seededProjection(overrides: {
  messages?: unknown[]
  sessionId?: string
} = {}): Record<string, unknown> {
  return {
    sessionId: overrides.sessionId ?? 's1',
    productId: 'atlascode',
    scopeId: 'main',
    semantics: 'persisted-effective-conversation',
    messages: overrides.messages ?? [
      { id: 'm1', role: 'user', createdAt: '2026-11-20T00:00:00Z', blocks: [{ kind: 'text', text: 'hello' }] },
      {
        id: 'm2', role: 'assistant', createdAt: null, blocks: [
          { kind: 'activity', label: 'Reading src/app.ts', status: 'done' },
          { kind: 'text', text: 'hi there' },
        ],
      },
    ],
    truncated: false,
  }
}

/** A valid seeded baseline follow event. */
function seededBaseline(projection: unknown = seededProjection()): Record<string, unknown> {
  return {
    kind: 'baseline', generation: '11111111-1111-4111-8111-111111111111',
    baselineId: '22222222-2222-4222-8222-222222222222', revision: 1,
    cursor: 'c0', projection, schemaVersion: 0,
    productId: 'atlascode', scopeId: 'main', subscriptionId: 'sub1',
  }
}

describe('projection adapter — replay load', () => {
  test('modelFromProjection maps a valid replay payload to the view model', () => {
    const model = modelFromProjection({ projection: seededProjection() })
    expect(model.status).toBe('replay')
    expect(model.sessionId).toBe('s1')
    expect(model.messages).toHaveLength(2)
    expect(model.messages[0]).toMatchObject({ id: 'm1', role: 'user', blocks: [{ kind: 'text', text: 'hello' }] })
    expect(model.messages[1]?.blocks[0]).toMatchObject({ kind: 'activity', label: 'Reading src/app.ts', status: 'done' })
    expect(model.annotationCount).toBe(0)
  })

  test('modelFromProjection fails closed on a non-object payload (no throw)', () => {
    for (const payload of [null, 42, 'x', {}]) {
      const model = modelFromProjection(payload)
      expect(model.status).toBe('replay')
      expect(model.messages).toEqual([])
      expect(model.annotationCount).toBeGreaterThan(0)
    }
  })
})

describe('projection adapter — follow events', () => {
  test('baseline replaces the model and marks it live', () => {
    const model = applyFollowEvent(modelFromProjection(null), seededBaseline())
    expect(model.status).toBe('live')
    expect(model.messages).toHaveLength(2)
    expect(model.annotationCount).toBe(0)
  })

  test('replacement replaces messages wholesale', () => {
    let model = applyFollowEvent(modelFromProjection(null), seededBaseline())
    const replacement = {
      ...seededBaseline(), kind: 'replacement', revision: 2,
      projection: seededProjection({ messages: [{ id: 'm3', role: 'assistant', createdAt: null, blocks: [{ kind: 'text', text: 'updated' }] }] }),
    }
    model = applyFollowEvent(model, replacement)
    expect(model.messages).toHaveLength(1)
    expect(model.messages[0]?.blocks[0]).toMatchObject({ kind: 'text', text: 'updated' })
  })

  test('resetRequired marks the model reset with the reason annotated (RF1 收敛)', () => {
    let model = applyFollowEvent(modelFromProjection(null), seededBaseline())
    model = applyFollowEvent(model, { kind: 'resetRequired', generation: 'g', reason: 'file replaced' })
    expect(model.status).toBe('reset')
    expect(model.messages).toHaveLength(2) // stale rows retained until the next baseline
    expect(model.annotations.some(a => a.reason.includes('file replaced'))).toBe(true)
  })

  test('error events annotate and mark the model error', () => {
    let model = applyFollowEvent(modelFromProjection(null), seededBaseline())
    model = applyFollowEvent(model, { kind: 'error', error: { code: 'resourceLimit', message: 'too big' } })
    expect(model.status).toBe('error')
    expect(model.error).toMatchObject({ code: 'resourceLimit', message: 'too big' })
  })

  test('closed is the terminal status', () => {
    let model = applyFollowEvent(modelFromProjection(null), seededBaseline())
    model = applyFollowEvent(model, { kind: 'closed' })
    expect(model.status).toBe('closed')
  })

  test('RF3: an unknown event kind is skipped and annotated, model intact', () => {
    const base = applyFollowEvent(modelFromProjection(null), seededBaseline())
    const model = applyFollowEvent(base, { kind: 'mystery', payload: { x: 1 } })
    expect(model.status).toBe('live')
    expect(model.messages).toHaveLength(2) // unchanged
    expect(model.annotationCount).toBe(base.annotationCount + 1)
    expect(model.annotations.some(a => a.reason.toLowerCase().includes('mystery'))).toBe(true)
  })

  test('RF3: a non-object event is skipped and annotated', () => {
    const base = applyFollowEvent(modelFromProjection(null), seededBaseline())
    const model = applyFollowEvent(base, 7)
    expect(model.messages).toHaveLength(2)
    expect(model.annotationCount).toBe(base.annotationCount + 1)
  })

  test('RF3: malformed baseline keeps the last good projection and annotates', () => {
    const base = applyFollowEvent(modelFromProjection(null), seededBaseline())
    const model = applyFollowEvent(base, seededBaseline(null))
    expect(model.status).toBe('live') // unchanged
    expect(model.messages).toHaveLength(2) // last good retained
    expect(model.annotationCount).toBe(base.annotationCount + 1)
  })

  test('RF3: malformed messages are skipped with annotations, valid ones kept', () => {
    const baseline = seededBaseline(seededProjection({
      messages: [
        { id: 'ok', role: 'user', createdAt: null, blocks: [{ kind: 'text', text: 'fine' }] },
        { garbage: true },
        { id: 'bad-role', role: 'wizard', createdAt: null, blocks: [] },
        { id: 'bad-blocks', role: 'assistant', createdAt: null, blocks: 'nope' },
      ],
    }))
    const model = applyFollowEvent(modelFromProjection(null), baseline)
    expect(model.messages.some(m => m.id === 'ok')).toBe(true)
    expect(model.messages.some(m => m.id === 'bad-role')).toBe(false)
    expect(model.messages.some(m => m.id === 'bad-blocks')).toBe(false)
    expect(model.annotationCount).toBeGreaterThanOrEqual(3)
  })

  test('RF3: unknown block kinds become annotation blocks in place', () => {
    const baseline = seededBaseline(seededProjection({
      messages: [{ id: 'm1', role: 'assistant', createdAt: null, blocks: [{ kind: 'text', text: 'a' }, { kind: 'blob', x: 1 }] }],
    }))
    const model = applyFollowEvent(modelFromProjection(null), baseline)
    const blocks = model.messages[0]?.blocks ?? []
    expect(blocks[0]).toMatchObject({ kind: 'text', text: 'a' })
    expect(blocks[1]).toMatchObject({ kind: 'annotation' })
    expect(String((blocks[1] as { reason?: string }).reason).length).toBeGreaterThan(0)
  })

  test('event application is immutable: the input model is not mutated', () => {
    const base = applyFollowEvent(modelFromProjection(null), seededBaseline())
    const frozen: ConversationModel = structuredClone(base)
    applyFollowEvent(base, { kind: 'mystery' })
    expect(base).toEqual(frozen)
  })
})

// F6-PAGE UI 消费波：分页行进增量 merge（§3 修形 3——分页结果并入模型，不重灌）。
describe('projection adapter — F6-PAGE paging merge', () => {
  const pageProjection = (messages: unknown[], sessionId = 'big') => ({
    projection: { sessionId, productId: 'atlascode', scopeId: 'main', semantics: 'persisted-effective-conversation', messages, truncated: true },
  })
  const msg = (id: string) => ({ id, role: 'user', createdAt: null, blocks: [{ kind: 'text', text: `body ${id}` }] })

  test('mergeProjectionPage appends page messages onto the existing model without rehydration', () => {
    const base = mergeProjectionPage(emptyConversation(), {
      ...pageProjection([msg('m1'), msg('m2')]),
      hasMore: true,
      nextPageToken: 'tok-1',
    })
    expect(base.messages.map(m => m.id)).toEqual(['m1', 'm2'])
    expect(base.status).toBe('paging-walk')
    expect(base.sessionId).toBe('big')
    expect(base.paging).toMatchObject({ loaded: 2, complete: false })

    const next = mergeProjectionPage(base, { ...pageProjection([msg('m3')]), hasMore: false })
    expect(next.messages.map(m => m.id)).toEqual(['m1', 'm2', 'm3'])
    expect(next.paging).toMatchObject({ loaded: 3, complete: true })
    // 不重灌：先前消息引用保留（非整体重建新数组对象去旧引用——id 序恒等即可）。
    expect(next.messages[0]).toBe(base.messages[0])
  })

  test('mergeProjectionPage dedupes by message id (无重) and preserves order (无漏)', () => {
    const base = mergeProjectionPage(emptyConversation(), { ...pageProjection([msg('m1'), msg('m2')]), hasMore: true, nextPageToken: 't' })
    const next = mergeProjectionPage(base, { ...pageProjection([msg('m2'), msg('m3')]), hasMore: false })
    expect(next.messages.map(m => m.id)).toEqual(['m1', 'm2', 'm3'])
  })

  test('mergeProjectionPage fails closed on a malformed page (annotate, no throw)', () => {
    const base = mergeProjectionPage(emptyConversation(), { projection: { garbage: true }, hasMore: true, nextPageToken: 't' })
    expect(base.annotationCount).toBeGreaterThan(0)
    expect(base.messages).toHaveLength(0)
    expect(base.status).toBe('paging-walk')
  })

  test('mergeProjectionPage keeps malformed page messages visible as annotations (RF3 形)', () => {
    const base = mergeProjectionPage(emptyConversation(), {
      ...pageProjection([{ garbage: true }, msg('ok')]),
      hasMore: false,
    })
    expect(base.messages.some(m => m.id === 'ok')).toBe(true)
    expect(base.annotationCount).toBeGreaterThan(0)
  })

  test('mergeProjectionPage is immutable', () => {
    const base = mergeProjectionPage(emptyConversation(), { ...pageProjection([msg('m1')]), hasMore: true, nextPageToken: 't' })
    const frozen: ConversationModel = structuredClone(base)
    mergeProjectionPage(base, { ...pageProjection([msg('m2')]), hasMore: false })
    expect(base).toEqual(frozen)
  })
})
