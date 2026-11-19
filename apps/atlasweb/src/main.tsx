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
  await ctx.plugin({
    apply: applyCode,
    inject: ['slots'],
  }, {
    connection: {
      baseUrl: window.location.origin,
      launchToken: takeLaunchToken(),
    },
  })

  const container = document.getElementById('root')
  if (container === null) throw new Error('missing #root mount element')
  return ctx.uiRenderer.mount(container)
}

const dispose = await boot()
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { dispose() })
}
