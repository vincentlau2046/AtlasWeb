// session scope 适配器（ui-session 等价件，2026-11-20 浏览器首启现形）。
//
// dsh 的 ui-session 包在 AtlasWeb 刻意未移植（产品服务子包禁入 R5）——但其
// 承担的 renderer 契约仍在：renderRoot 全树包 ScopeProvider('session-maybe')，
// 'session' 适配器须恒安装（"maybe" 语义在绑定级：blank = key undefined 绑定，
// 选中 = ScopedStandardSourceBinding{key, ctx}；adoption 恒稳见 renderer
// SessionMaybeEntry 文档）。本适配器以 web-code controller 的选中态
// （controller.sessionId）为唯一事实源，补上 renderer 契约面：
//   current      — blank/selected 绑定（hooks/keyedHooks/props 恒空：会话数据
//                  经 seat inject 供给，绑定只承载身份）；
//   bindingSource— undefined/null → current；命中当前 id → current；其余 →
//                  blank 源（不可解析 id 走 no-session 分支，SessionAreaProps
//                  empty 语义）；
//   renderArea   — blank → empty 分支；selected → children（area 座语义）。
// ctx 身份（cordis Context 实例，registry.test 先例）：同 id 重开恒同
// （零重挂），换 id 新建（重挂清 component-local 态——adoption 语义）。
import { Context } from '@deepseek-ai/cordis'
import type { SessionAreaProps, StandardSourceBinding, SlotScopeAdapter } from '@atlasweb/web-slots'
import type { WebCodeController } from './controller.ts'

const BLANK: StandardSourceBinding = { key: undefined, hooks: {}, keyedHooks: {}, props: {} }
const BLANK_SOURCE = {
  getSnapshot: (): StandardSourceBinding => BLANK,
  subscribe: (): (() => void) => () => {},
}

export interface SessionScopeAdapter extends SlotScopeAdapter {
  /** 释放 controller.sessionId 订阅（apply 经 ctx.effect 挂生命周期）。 */
  dispose(): void
}

export function createSessionScopeAdapter(controller: WebCodeController): SessionScopeAdapter {
  let binding: StandardSourceBinding = BLANK
  const listeners = new Set<() => void>()
  let identityCtx: Context | undefined
  let identityFor: string | null = null

  const publish = (next: StandardSourceBinding): void => {
    binding = next
    for (const listener of [...listeners]) {
      try {
        listener()
      } catch {
        // 监听方异常不得阻断发布（React useSyncExternalStore 会重试渲染）
      }
    }
  }

  const unsubscribe = controller.sessionId.subscribe(() => {
    const id = controller.sessionId.getSnapshot()
    if (id === null) {
      identityCtx = undefined
      identityFor = null
      publish(BLANK)
      return
    }
    if (id !== identityFor) {
      identityCtx = new Context()
      identityFor = id
    }
    publish({ key: id, ctx: identityCtx!, hooks: {}, keyedHooks: {}, props: {} })
  })

  const current = {
    getSnapshot: (): StandardSourceBinding => binding,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }

  return {
    current,
    bindingSource(target: SessionAreaProps['session']) {
      if (target === undefined || target === null) return current
      const id = typeof target === 'string' ? target : (target as { sessionId?: string } | undefined)?.sessionId
      if (typeof id === 'string' && id === controller.sessionId.getSnapshot()) return current
      return BLANK_SOURCE
    },
    renderArea(areaBinding: StandardSourceBinding, props: SessionAreaProps) {
      return areaBinding.key === undefined ? (props.empty?.() ?? null) : props.children
    },
    dispose() {
      unsubscribe()
    },
  }
}
