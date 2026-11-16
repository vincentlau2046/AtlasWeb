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
 * - engine is optional: absent → upstream default carrier
 *   (`createDefaultReadonlySessionRuntime`, S0-R2 form A, 0.1.117+);
 *   explicit injection stays available for tests/replacement — AtlasWeb
 *   never hand-copies engine internals.
 *
 * Zero side effects at import: no fs reads beyond what Node module loading
 * itself requires, no env reads, no timers, no sockets.
 */
import {
  createDefaultReadonlySessionRuntime,
  createReadonlySessionRuntime,
  type ReadonlySessionEngine,
  type ReadonlySessionLimits,
  type ReadonlySessionRuntime,
  type ReadonlySessionScopes,
} from '@atlasharness/atlascode/web-session-runtime'

export interface SessionHostOptions {
  productId: string
  scopes: ReadonlySessionScopes
  /** 可选：显式 engine 注入（上游注入缝）。缺省 = 上游默认载体（0.1.117+）。 */
  engine?: ReadonlySessionEngine
  limits?: ReadonlySessionLimits
  /** 测试注入缝：覆盖底层 runtime（生产路径恒用上游 published factory）。 */
  runtimeOverride?: ReadonlySessionRuntime
}

export interface SessionHost {
  readonly epoch: string
  readonly limits: ReadonlySessionRuntime['limits']
  start(): Promise<void>
  listSessions(request: { scopeId: string }, signal?: AbortSignal): ReturnType<ReadonlySessionRuntime['listSessions']>
  replaySession(request: { scopeId: string; sessionId: string }, signal?: AbortSignal): ReturnType<ReadonlySessionRuntime['replaySession']>
  followSession(request: { scopeId: string; sessionId: string }, signal?: AbortSignal): ReturnType<ReadonlySessionRuntime['followSession']>
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
  if (options.engine && typeof options.engine.loadTranscriptFull !== 'function') {
    throw new Error('injected engine must expose loadTranscriptFull')
  }

  // 0.1.117+：engine 真体随上游 bundle（S0-R2 形 A）——缺省走默认载体；
  // 显式注入缝保留给测试/替换。AtlasWeb 永不手抄 engine 内部。
  const runtime: ReadonlySessionRuntime = options.runtimeOverride ?? (options.engine
    ? createReadonlySessionRuntime({
        productId: options.productId,
        scopes,
        engine: options.engine,
        limits: options.limits,
      })
    : createDefaultReadonlySessionRuntime({
        productId: options.productId,
        scopes,
        limits: options.limits,
      }))

  // 生命周期状态机（fail-closed，无双态竞态）：
  // - closed 是同步终态：一旦置位，任何 start 完成回调不得翻回 started；
  // - start 序列化：并发 start 共享同一个底层 start() promise；
  // - close 在启动在途时等待该 promise，再关底层 runtime（关终胜出）。
  let closed = false
  let started = false
  let pendingStart: Promise<void> | null = null

  const doStart = (): Promise<void> => {
    if (closed) return Promise.reject(new Error('closed'))
    if (started) return Promise.resolve()
    if (!pendingStart) {
      pendingStart = (async () => {
        await runtime.start()
        if (closed) {
          // 启动完成前已被 close：终态不被启动回调翻回 started；
          // 底层由 close 的等待路径负责关闭。
          return
        }
        started = true
      })().finally(() => {
        // 挂起标记随结算清空：失败且未 closed 时允许重试。
        pendingStart = null
      })
    }
    return pendingStart
  }

  return {
    epoch: runtime.epoch,
    limits: runtime.limits,
    async start(): Promise<void> {
      await doStart()
    },
    async listSessions(request, signal) {
      if (closed) throw new Error('closed')
      if (!started) throw new Error('not started')
      return runtime.listSessions(request, signal)
    },
    async replaySession(request, signal) {
      if (closed) throw new Error('closed')
      if (!started) throw new Error('not started')
      return runtime.replaySession(request, signal)
    },
    async followSession(request, signal) {
      if (closed) throw new Error('closed')
      if (!started) throw new Error('not started')
      return runtime.followSession(request, signal)
    },
    async close(): Promise<void> {
      if (closed) return
      closed = true // 同步终态占位：随后到达的 start 一律拒 closed
      if (pendingStart) {
        await pendingStart.catch(() => {})
        pendingStart = null
      }
      started = false
      await runtime.close()
    },
  }
}
