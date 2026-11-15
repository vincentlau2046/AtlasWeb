/**
 * AtlasWeb host session service (G1 skeleton).
 *
 * Wraps the upstream-published narrow readonly runtime
 * (`@atlasharness/atlascode/web-session-runtime`) behind an explicit,
 * fail-closed configuration seam:
 *
 * - scopes are always injected explicitly (scopeId ↔ storageDir mapping);
 *   there is NO default HOME fallback and no product-directory probing;
 * - lifecycle delegates to the runtime (start / close-idempotent /
 *   post-close reject); the host never restarts a closed runtime epoch;
 * - the engine injection seam is a constructor argument — the real engine
 *   carrier is an upstream deliverable (S0-R2 ticket); AtlasWeb never
 *   hand-copies engine internals.
 *
 * Zero side effects at import: no fs reads beyond what Node module loading
 * itself requires, no env reads, no timers, no sockets.
 */
import {
  createReadonlySessionRuntime,
  type ReadonlySessionEngine,
  type ReadonlySessionLimits,
  type ReadonlySessionRuntime,
  type ReadonlySessionScopes,
} from '@atlasharness/atlascode/web-session-runtime'

export interface SessionHostOptions {
  productId: string
  scopes: ReadonlySessionScopes
  engine: ReadonlySessionEngine
  limits?: ReadonlySessionLimits
}

export interface SessionHost {
  readonly epoch: string
  readonly limits: ReadonlySessionRuntime['limits']
  start(): Promise<void>
  listSessions(request: { scopeId: string }, signal?: AbortSignal): ReturnType<ReadonlySessionRuntime['listSessions']>
  close(): Promise<void>
}

function validateScopes(scopes: ReadonlySessionScopes | undefined): ReadonlySessionScopes {
  if (!scopes || scopes.length === 0) {
    throw new Error('scopes must be explicitly injected; no default HOME fallback')
  }
  const seen = new Set<string>()
  for (const scope of scopes) {
    if (!scope.scopeId) {
      throw new Error('scope entry missing scopeId')
    }
    if (!scope.storageDir || !scope.storageDir.startsWith('/')) {
      throw new Error(`scope "${scope.scopeId}" storageDir must be an absolute path`)
    }
    if (seen.has(scope.scopeId)) {
      throw new Error(`duplicate scopeId "${scope.scopeId}"`)
    }
    seen.add(scope.scopeId)
  }
  return scopes
}

export function createSessionHost(options: SessionHostOptions): SessionHost {
  if (!options.productId) {
    throw new Error('productId is required')
  }
  const scopes = validateScopes(options.scopes)
  if (!options.engine || typeof options.engine.loadTranscriptFull !== 'function') {
    throw new Error('engine must be injected; AtlasWeb never hand-copies engine internals')
  }

  const runtime: ReadonlySessionRuntime = createReadonlySessionRuntime({
    productId: options.productId,
    scopes,
    engine: options.engine,
    limits: options.limits,
  })

  let state: 'created' | 'started' | 'closed' = 'created'
  return {
    epoch: runtime.epoch,
    limits: runtime.limits,
    async start(): Promise<void> {
      if (state === 'closed') throw new Error('closed')
      if (state === 'started') return
      await runtime.start()
      state = 'started'
    },
    async listSessions(request, signal) {
      if (state === 'closed') throw new Error('closed')
      if (state !== 'started') throw new Error('not started')
      return runtime.listSessions(request, signal)
    },
    async close(): Promise<void> {
      if (state === 'closed') return
      state = 'closed'
      await runtime.close()
    },
  }
}
