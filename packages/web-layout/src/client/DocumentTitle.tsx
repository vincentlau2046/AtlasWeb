// Adapted from dsh@dsh-v0.2.2-rc.2 packages/client/ui-layout/src/client/DocumentTitle.tsx (MIT).
// Adaptation: `useSessions` arrives through the Atlas structural session face
// (session-face.ts — the web-code bundle supplies the hook at the root
// runtime, Task 8); the PropsRuntime Pick stays over the same standard-prop
// name. MIT license; original dsh header below.
/** Browser title selection follows the active main panel without subscribing the frame. */
import { useEffect } from 'react'
import type { PropsRuntime } from '@atlasweb/web-slots'
import type { SessionTitleState } from './session-face.ts'

/** Props for the browser title projection. */
export type DocumentTitleProps = Pick<PropsRuntime<'root'>, 'useSessions' | 'usePanelInfo'> & {
  /** Brand-configured product title (the brand inject face). */
  productTitle: string
}

/**
 * Project the selected durable session title into the browser title and
 * restore the brand product title when unmounted.
 * @param props - Selected session title projection.
 * @returns No rendered content.
 */
export function DocumentTitle({ useSessions, usePanelInfo, productTitle }: DocumentTitleProps): null {
  const showSessionTitle = usePanelInfo(info => info.activePanelId === null)
  const title = useSessions((state: SessionTitleState) => {
    const current = Object.values(state.byId)
      .find(session => (session.retainedBy.mainView ?? 0) > 0)?.id
    return !showSessionTitle || current === undefined ? undefined : state.byId[current]?.title
  })
  useEffect(() => {
    document.title = title === undefined ? productTitle : `${title} — ${productTitle}`
    return () => { document.title = productTitle }
  }, [productTitle, title])
  return null
}
