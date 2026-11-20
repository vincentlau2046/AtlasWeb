// T6-A Task 8: 侧栏导航列视图（纯展示层——SSR 可渲染，props 全量注入；
// 槽位桥在 index.ts 装配）。SessionList + SessionSearch 两面：空仓态
// data-empty-state（RF2）、I/O 错误 data-list-error、搜索命中 snippet。
import { useState } from 'react'
import { Input, Pill } from '@atlasweb/web-primitives'
import type { SessionListModel, SearchResultVM, SessionRowVM } from '../controller.ts'

/** Presentation props for the navigation column. */
export interface NavigationColumnViewProps {
  sessions: SessionRowVM[]
  listStatus: SessionListModel['status']
  listError?: { code: string; message: string }
  searchResults: SearchResultVM[]
  searchQuery: string
  /** Currently open session id (row highlight; null = none selected). */
  selectedId?: string | null
  onOpenSession(id: string): void
  onSearch(query: string): void
}

/**
 * The sidebar column: search box over hit rows, then the session list.
 * @param props - injected model slices + actions.
 * @returns the column markup.
 */
export function NavigationColumnView(props: NavigationColumnViewProps) {
  const [draft, setDraft] = useState(props.searchQuery)
  const showSearch = props.searchQuery.length > 0
  return (
    <div className='web-code-nav' data-nav-column>
      <form
        onSubmit={event => {
          event.preventDefault()
          props.onSearch(draft)
        }}
      >
        <Input
          aria-label='Search sessions'
          placeholder='Search sessions…'
          value={draft}
          onChange={event => { setDraft(event.currentTarget.value) }}
        />
      </form>
      {showSearch && (
        <div className='web-code-nav-search' data-search-results>
          {props.searchResults.length === 0
            ? <div data-search-empty>No matches.</div>
            : props.searchResults.map(result => (
              <button
                key={`${result.sessionId}:${result.messageId}`}
                type='button'
                className='web-code-nav-row'
                data-search-hit
                onClick={() => { props.onOpenSession(result.sessionId) }}
              >
                <span className='web-code-nav-snippet'>{result.snippet}</span>
              </button>
            ))}
        </div>
      )}
      <div className='web-code-nav-list' data-session-list>
        {props.listStatus === 'error' && (
          <div data-list-error role='alert'>
            <Pill className='web-code-error-pill'>{props.listError?.code ?? 'error'}</Pill>
            {props.listError?.code === 'unauthorized'
              ? (
                <span>
                  Session access unauthorized — your open link has expired or the session cookie is gone.
                  Re-run the atlasweb command to get a fresh open link.
                </span>
              )
              : <span>{props.listError?.message ?? 'session list failed'}</span>}
          </div>
        )}
        {props.listStatus !== 'error' && props.sessions.length === 0 && (
          <div data-empty-state>No sessions yet. Open Atlas to start its first conversation.</div>
        )}
        {props.sessions.map(session => (
          <button
            key={session.id}
            type='button'
            className='web-code-nav-row'
            data-session-id={session.id}
            data-selected={session.id === props.selectedId || undefined}
            onClick={() => { props.onOpenSession(session.id) }}
          >
            <span className='web-code-nav-title'>{session.title ?? '(untitled)'}</span>
            <span className='web-code-nav-meta'>
              {session.messageCount === null ? '' : `${session.messageCount} msgs`}
              {session.updatedAt.length > 0 ? ` · ${session.updatedAt.slice(0, 10)}` : ''}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
