// T6-A Task 8 RED: 四视图 SSR 腿（DOM-free，react-dom/server）——
// RF2 空态 / RF3 标注可见 / RF5 有界渲染。
import { describe, expect, test } from 'bun:test'
import { renderToString } from 'react-dom/server'
import { ConversationView } from '../src/views/ConversationView.tsx'
import { NavigationColumnView } from '../src/views/NavigationColumnView.tsx'
import { modelFromProjection } from '../src/projection.ts'

const ROWS = [
  { id: 's1', title: 'Session one', messageCount: 4, updatedAt: '2026-11-20T01:00:00Z' },
  { id: 's2', title: null, messageCount: null, updatedAt: '2026-11-19T01:00:00Z' },
]

const RESULTS = [{ sessionId: 's1', messageId: 'm1', snippet: '…hello world…' }]

describe('NavigationColumnView', () => {
  const base = {
    sessions: ROWS, listStatus: 'ready' as const,
    searchResults: [] as typeof RESULTS, searchQuery: '',
    onOpenSession: () => {}, onSearch: () => {},
  }

  test('RF2: an empty repo renders the empty state, not a blank or crash', () => {
    const html = renderToString(<NavigationColumnView {...base} sessions={[]} />)
    expect(html).toContain('data-empty-state')
    expect(html.length).toBeGreaterThan(50)
  })

  test('session rows render titles and stable order', () => {
    const html = renderToString(<NavigationColumnView {...base} />)
    expect(html.indexOf('Session one')).toBeLessThan(html.indexOf('(untitled)'))
    expect(html).toContain('Session one')
    expect(html).toContain('(untitled)')
  })

  test('search results render snippets', () => {
    const html = renderToString(<NavigationColumnView {...base} searchResults={RESULTS} searchQuery='hello' />)
    expect(html).toContain('…hello world…')
  })

  test('an error list status renders the error annotation, not a crash', () => {
    const html = renderToString(
      <NavigationColumnView {...base} sessions={[]} listStatus='error' listError={{ code: 'scopeDenied', message: 'session list denied' }} />,
    )
    expect(html).toContain('data-list-error')
    expect(html).toContain('scopeDenied')
    expect(html).toContain('session list denied')
  })
})

describe('ConversationView', () => {
  const seeded = {
    sessionId: 's1', productId: 'atlascode', scopeId: 'main',
    semantics: 'persisted-effective-conversation',
    messages: [
      { id: 'm1', role: 'user', createdAt: '2026-11-20T00:00:00Z', blocks: [{ kind: 'text', text: 'hello' }] },
      { id: 'm2', role: 'assistant', createdAt: null, blocks: [{ kind: 'activity', label: 'Reading src/app.ts', status: 'done' }] },
    ],
    truncated: false,
  }

  test('RF2: an empty conversation renders the empty state', () => {
    const model = modelFromProjection(null)
    const html = renderToString(<ConversationView conversation={model} />)
    expect(html).toContain('data-empty-state')
  })

  test('text and activity blocks render their content', () => {
    const model = modelFromProjection({ projection: seeded })
    const html = renderToString(<ConversationView conversation={model} />)
    expect(html).toContain('hello')
    expect(html).toContain('Reading src/app.ts')
    expect(html).toContain('done')
  })

  test('RF3: annotation blocks render their reason visibly', () => {
    const model = modelFromProjection({
      projection: {
        ...seeded,
        messages: [{ id: 'm1', role: 'assistant', createdAt: null, blocks: [{ kind: 'blob' as unknown as 'text', x: 1 }] }],
      },
    })
    const html = renderToString(<ConversationView conversation={model} />)
    expect(html).toContain('data-annotation')
  })

  test('connection status renders as a marked attribute', () => {
    for (const status of ['live', 'reset', 'closed', 'error'] as const) {
      const model = { ...modelFromProjection({ projection: seeded }), status }
      const html = renderToString(<ConversationView conversation={model} />)
      expect(html).toContain(`data-conn-status="${status}"`)
    }
  })

  test('an error model renders the error code', () => {
    const model = { ...modelFromProjection({ projection: seeded }), status: 'error' as const, error: { code: 'resourceLimit', message: 'too big' } }
    const html = renderToString(<ConversationView conversation={model} />)
    expect(html).toContain('resourceLimit')
  })

  test('RF5: only the visible window slice is rendered (bounded DOM)', () => {
    const big = {
      ...seeded,
      messages: Array.from({ length: 500 }, (_, i) => ({
        id: `m${i}`, role: 'assistant', createdAt: null, blocks: [{ kind: 'text', text: `row-${i}` }],
      })),
    }
    const model = modelFromProjection({ projection: big })
    const html = renderToString(<ConversationView conversation={model} visibleRange={{ start: 100, end: 160 }} />)
    expect(html).toContain('row-100')
    expect(html).toContain('row-159')
    expect(html).toContain('data-message-id="m100"')
    expect(html).not.toContain('data-message-id="m99"')
    expect(html).not.toContain('data-message-id="m160"')
    expect(html).not.toContain('data-message-id="m499"')
  })
})
