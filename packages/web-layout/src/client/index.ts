// Adapted from dsh@dsh-v0.2.2-rc.2 packages/client/ui-layout/src/client/index.ts (MIT).
// Adaptations (R5 product-service edges, dsh@tag 原形逐字可回的剥离形):
// - locale edge stripped: the command-label dictionary registration, the
//   register() `locale` option, and the LocaleNamespaceMap aug are gone;
//   the slot registration stays locale-free.
// - shortcuts edge stripped: the sidebar-toggle command registration block is
//   gone (键位归 shell 宿主——plan D-3 债行同源); ShortcutCommandId import gone.
// - sessions edge: useSessions arrives through the structural session face
//   (session-face.ts) that the web-code bundle satisfies at the root runtime
//   (Task 8 contract) instead of the product package aug.
// - brand edge added: the plugin waits on the `brand` service and hands
//   BrandFace to AppFrame through the inject face (product title source).
// Everything else verbatim. MIT license; original dsh header below.
/**
 * Layout plugin, browser half: one register() call contributes AppFrame into
 * the runtime's built-in 'root' slot and, in the same breath, declares the
 * child slots (declaration = exclusive render authority), seats the
 * layout store (panel geometry), and wires the panel-action service face.
 * ctx.layout selects the main panel and controls column geometry; Session
 * selection belongs to the runtime sessions service. A second effect seats the
 * theme presenter, which projects ctx.theme snapshots onto document.body.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@atlasweb/web-renderer/client'
import type {} from '@atlasweb/web-theme/client'
import type { HostObservable, SnapshotSelectorHook } from '@atlasweb/web-slots'
import type { PanelInfo } from './service.ts'
import { AppFrame } from './AppFrame.tsx'
import type { AppFrameInjected } from './AppFrame.tsx'
import { createLayoutStore } from './stores.ts'
import { LayoutController } from './service.ts'
import type { UseSessionsTitle } from './session-face.ts'
import { ThemePresenter } from './theme-presenter.ts'

// Contract exports only (export-convergence rule: cross-package consumers
// keep a symbol exported; test-only/package-internal symbols live off /src).
// ILayout: the ctx.layout face consumers and test fakes type against.
// OwnerShare contracts below are the render-side halves registrants compose
// against; the frame components and the store factory are package-internal.
export { LayoutController } from './service.ts'
export type { ILayout, MainPanelId, PanelInfo } from './service.ts'
export type { SessionTitleEntry, SessionTitleState, UseSessionsTitle } from './session-face.ts'
export { DARK_ATTRIBUTE, THEME_SOURCE_ATTRIBUTE, CONTENT_FONT_SIZE_VARIABLE, ThemePresenter } from './theme-presenter.ts'

/** Selector hook over root-scoped panel selection. */
export type UsePanelInfo = SnapshotSelectorHook<PanelInfo>

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The outward face only; the concrete service stays inside this plugin. */
    layout: import('./service.ts').ILayout
  }
}

declare module '@atlasweb/web-slots' {
  interface GlobalStandardProps {
    /** Subscribe to the selected main panel independently of parent renders. */
    usePanelInfo: UsePanelInfo
    /** Structural sessions face — the web-code bundle supplies it at the root runtime (Task 8). */
    useSessions: UseSessionsTitle
  }

  interface SlotMap {
    // The 'root' entry itself is the runtime's built-in slot (declared
    // there); these are the frame's children, declared by the same
    // register() call that contributes AppFrame. Session owners never pass
    // sessionId: the framework injects it as a standard prop.
    /**
     * The whole left column. OCCUPIED by the Code bundle's navigation column
     * (web-code, Task 8) — registering here replaces the navigation column
     * outright rather than adding to it, and the seats it declares disappear
     * with it. To add something to the sidebar, register into one of those
     * inner seats instead.
     *
     * The occupant receives the frame's collapsed state, width and drawer mode.
     * Drawer content stays mounted while hidden; other browser columns retain
     * a compact control rail while collapsed.
     */
    'sidebar': { kind: 'single'; scope: 'root'; owner: SidebarOwnerProps }
    /**
     * Central panel selected by sidebar entry id. The reserved `conversation`
     * key hosts the Conversation; other keys receive no Session binding.
     */
    'main': { kind: 'keyed'; scope: 'root' }
    /**
     * The right column: a track the centre makes room for, or nothing. OCCUPIED
     * by the right navigation panel (Task 8 bundle), which uses the resolved
     * column width in normal mode and covers the viewport in fullscreen,
     * retaining the wide-screen column reservation underneath.
     *
     * Whether the panel is shown, and whether it takes a track, is the
     * occupant's own recorded business — it reports the composition of its
     * expanded and presentation state through `ctx.layout`, and the frame sizes
     * the track and places the resize handle from that. The expand control is
     * not this column's: it is a button in the conversation header. The root
     * occupant decides when to render its Session-bound content.
     */
    'rightbar': { kind: 'single'; scope: 'root'; owner: RightbarOwnerProps }
    /**
     * Full-width bottom content below all three columns. Its rendered height
     * reduces the columns' available height; empty content reserves no space.
     * The occupant owns its height, visibility, and controls. It receives no
     * Session binding and remains mounted across main-panel navigation.
     */
    'shell.bottom': { kind: 'single'; scope: 'root' }
    /**
     * Frame-wide floating layer, above every column and outside their scroll
     * containers. Deliberately generic and unowned by any feature: a badge, a
     * toast stack or a status pill all belong here, and entries order among
     * themselves. The layer itself is click-through — entries opt back into
     * pointer events — so an occupant never blocks the app underneath.
     *
     * This is the additive seat for a frame-wide surface of your own: a fresh
     * `id` is added beside the shipped entries instead of replacing them.
     */
    'shell.overlay': { kind: 'list'; scope: 'root' }
    /**
     * Window-chrome seat at the frame's top-left, over every main panel.
     * Mounted for narrow drawers and collapsed macOS desktop sidebars. macOS
     * traffic lights sit before it outside native fullscreen; browser controls
     * start at the frame edge. OCCUPIED by the shell host's reopen controls.
     *
     * While the seat is mounted the frame publishes
     * `--dsh-frame-leading-clearance` (the inline inset the seat's band
     * occupies, measured from the frame's left edge); a main panel whose
     * content reaches the top-left corner pads by it so nothing lands under
     * the lights or the controls.
     */
    'shell.leading': { kind: 'single'; scope: 'root' }
  }
}

// OwnerShare contracts — the render-side share the slot owner supplies at
// renderSlot. Registrants IMPORT these and compose their full component props
// from the framework-derived shares. Conversation business state and actions arrive through
// framework-standard hooks and each registrant's inject face, not owner props.

/** Sidebar owner share: live column state from the frame's concession solve. */
export interface SidebarOwnerProps {
  /** True when closed; a drawer is hidden, while other browser columns retain a rail. */
  collapsed: boolean
  /** Rendered sidebar width in px; a hidden drawer retains its expanded width. */
  width: number
  /** Present the retained sidebar content as an overlay drawer. */
  drawer: boolean
}

/** Right column owner share: resolved normal geometry and opening eligibility. */
export interface RightbarOwnerProps {
  /** Resolved normal panel width in px, not the saved preference; zero if it cannot fit. */
  width: number
  /** Current frame width in px. */
  viewportWidth: number
  /**
   * Whether a normal right panel can retain 300px beside a 400px center.
   * Before a narrow opening, includes the space from collapsing the left sidebar.
   */
  canShow: boolean
}

/** Required services (cordis fiber inject — the loader passes all module exports as an object plugin). */
export const inject = ['slots', 'theme', 'brand']

/**
 * Client plugin body: provide ctx.layout, then one register() call — AppFrame
 * into 'root' with its child-slot declarations, the layout store seat,
 * and the shared root instance supplying the panel-info source.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    // Headless profiles can instantiate client registrations without browser media APIs.
    const query = typeof matchMedia === 'function'
      ? matchMedia('(device-posture: folded) and (orientation: landscape)') : undefined
    const foldedLandscape: HostObservable<boolean> = {
      getSnapshot: () => query?.matches ?? false,
      subscribe: (listener) => {
        query?.addEventListener('change', listener)
        return () => { query?.removeEventListener('change', listener) }
      },
    }
    const handle = createLayoutStore()
    const instance = handle.create()
    const store: typeof handle = { ...handle, create: () => instance }
    const retainMainPanels = (): void => {
      instance.actions.retainMainPanels(ctx.slots.entries('main').flatMap(entry =>
        entry.options.key === undefined ? [] : [entry.options.key]))
    }
    const panelInfo: HostObservable<PanelInfo> = {
      getSnapshot: () => instance.getSnapshot().panelInfo,
      subscribe: listener => instance.subscribe(listener),
    }
    const layout = new LayoutController(instance.actions, id =>
      ctx.slots.entries('main').some(entry => entry.options.key === id), panelInfo)
    const disposePanelInfo = ctx.slots.provideRoot({ hooks: { panelInfo: layout.panelInfo } })
    const disposeService = ctx.reflect.provide('layout', layout)
    const disposeRegistration = ctx.slots.register({
      name: 'root',
      children: {
        'sidebar': { kind: 'single', scope: 'root' },
        'main': { kind: 'keyed', scope: 'root' },
        'rightbar': { kind: 'single', scope: 'root' },
        'shell.bottom': { kind: 'single', scope: 'root' },
        'shell.overlay': { kind: 'list', scope: 'root' },
        'shell.leading': { kind: 'single', scope: 'root' },
      },
      store,
      inject: (): AppFrameInjected => ({ hooks: { foldedLandscape }, brand: ctx.brand }),
    }, AppFrame)
    const disposePanels = ctx.slots.subscribe('main', retainMainPanels)
    retainMainPanels()
    return () => {
      layout.dispose()
      disposePanels()
      disposeRegistration()
      disposePanelInfo()
      // provide()'s disposer settles asynchronously; teardown is synchronous fire-and-forget.
      void disposeService()
    }
  }, 'ui-layout: service + root registration')

  // Theme presentation: pure DOM writes from resolved snapshots — initial
  // state through the getter once, then event-driven only; no React path.
  ctx.effect(() => {
    const presenter = new ThemePresenter()
    presenter.apply(ctx.theme.getTheme())
    const off = ctx.on('theme/change', (snapshot) => { presenter.apply(snapshot) })
    return () => {
      off()
      presenter.dispose()
    }
  }, 'ui-layout: theme presenter')
}
