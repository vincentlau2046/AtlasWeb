// T6-A Task 9: AtlasWeb shell boot 装配。顺序（cordis 依赖序）：
// ① web-renderer client plugin（建 SlotRegistry + install renderer + 提供
//    uiRenderer.mount）；② theme runtime（brand durable transport = Task 8
//    ThemeSettingsStore，浏览器 storage 适配）；③ brand face；④ layout
//    plugin（inject ['slots','theme','brand']，AppFrame 入 root 槽）；⑤
//    web-code apply（连接 + 四视图注册 + 根 sessions 供给）；⑥ mount。
// 连接配置：baseUrl = 同源；launch token 走 URL ?token= 自动 redeem
// （web-host launchCli ready JSON 的 token 面），redeem 后剥除查询参数。
import { Context } from '@deepseek-ai/cordis'
import { apply as applyUiRenderer } from '@atlasweb/web-renderer/client'
// 挂载默认面（G-A，2026-11-20 实机定谳）：html/body/#root height 链 + margin 0
// + 字体/颜色/背景 + button font-inherit——dsh 桌面壳由 boot.ts 携带，AtlasWeb
// web 装配链（renderer→theme→brand→layout→code）此前零引用 → 8px 边距 +
// height 链塌 + UA 字体 = 裸文档形。
import '@atlasweb/web-shell/base.css'
import { provideThemeRuntime, installThemeStyles } from '@atlasweb/web-theme/client'
import { createThemeSettingsStore, provideBrand } from '@atlasweb/web-brand'
import { apply as applyLayout } from '@atlasweb/web-layout'
import { apply as applyCode } from '@atlasweb/web-code'
import type { ThemeSettingsStorage } from '@atlasweb/web-brand'

/** Browser storage adapter (durable theme settings transport backend). */
const browserStorage: ThemeSettingsStorage = {
  getItem: key => (typeof localStorage === 'undefined' ? null : localStorage.getItem(key)),
  setItem: (key, value) => { if (typeof localStorage !== 'undefined') localStorage.setItem(key, value) },
}

/** Consume the launch token from the URL and strip it from the address bar. */
function takeLaunchToken(): string | undefined {
  if (typeof window === 'undefined') return undefined
  const url = new URL(window.location.href)
  const token = url.searchParams.get('token') ?? undefined
  if (token !== undefined) {
    url.searchParams.delete('token')
    window.history.replaceState(null, '', url.toString())
  }
  return token
}

async function boot(): Promise<() => void> {
  const ctx = new Context()

  await ctx.plugin({ apply: applyUiRenderer, inject: [] })
  const themeStore = createThemeSettingsStore({ storage: browserStorage })
  provideThemeRuntime(ctx, themeStore)
  installThemeStyles(ctx)
  provideBrand(ctx)
  await ctx.plugin({ apply: applyLayout, inject: ['slots', 'theme', 'brand'] })

  const container = document.getElementById('root')
  if (container === null) throw new Error('missing #root mount element')

  // 连接凭据双面：URL 有 token → redeem；无 token（F5 reload / 重入，token
  // 兑换后已剥）→ ambient cookie 面（credential ''，同源 fetch 随发 cookie；
  // 首访无 cookie → 401 报错面呈现，fail-closed 不 crash）。
  const launchToken = takeLaunchToken()
  // A3：URL ?session=<id> = 当前选择提示（读取不等于授权）；随会话切换
  // 由 web-code 回写。阅读锚 = sessionStorage（同标签页刷新恢复）。
  const initialSessionId = new URL(window.location.href).searchParams.get('session') ?? undefined
  try {
    await ctx.plugin({
      apply: applyCode,
      inject: ['slots'],
    }, {
      connection: {
        baseUrl: window.location.origin,
        ...(launchToken !== undefined ? { launchToken } : { credential: '' }),
      },
      ...(initialSessionId !== undefined ? { initialSessionId } : {}),
      anchorStorage: typeof sessionStorage !== 'undefined' ? sessionStorage : null,
    })
  } catch (error) {
    // A1 安装错误视图：兑换失败（打开链接无效/已过期且无 ambient cookie）
    // → 恢复指引渲染，不崩空、不自动授权。与 NavigationColumnView 的
    // 会话 401 指引同词汇族（atlasweb 重开命令）。
    renderRecoveryNotice(container, error)
    return () => {}
  }

  return ctx.uiRenderer.mount(container)
}

/** 兑换失败恢复面：role='alert' 重开指引（含 atlasweb 命令词）。 */
function renderRecoveryNotice(container: HTMLElement, error: unknown): void {
  const detail = error instanceof Error ? error.message : String(error)
  container.replaceChildren()
  const alert = document.createElement('div')
  alert.setAttribute('role', 'alert')
  alert.setAttribute('data-recovery-notice', '')
  alert.textContent =
    `AtlasWeb could not open this link (${detail}). The open link is single-use and may have expired. `
    + 'Re-run the atlasweb command (atlasweb --scope <id>=<dir>) to get a fresh open link — '
    + 'no automatic authorization is attempted.'
  container.appendChild(alert)
}

const dispose = await boot()
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { dispose() })
}
