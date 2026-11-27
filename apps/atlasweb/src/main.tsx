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
import { apply as applyCode, createHttpExecutionTransport } from '@atlasweb/web-code'
import { connect } from '@atlasweb/web-connection'
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
  // B1/B3 执行通道挂载（B 附表 §2「probe 后挂载写控件」——probe 本体在 web-code
  // ExecutionController.attach 内）：组合根 workspace 意图 = 打开链接
  // ?workspace=<id> hint（深链回退）OR discovery 列表选中项（增量①——列表
  // 选择面在 web-code，选中项优先于 hint）。缺省（无 hint 且列表空）= 纯只读，
  // 执行面零渲染（合同 §10）。授权不在客户端裁决：服务端逐命令对表
  // workspaceAuth（E1），未授权 id 全命令 403。
  const executionWorkspace = new URL(window.location.href).searchParams.get('workspace')
  const hasExecutionHint = executionWorkspace !== null && executionWorkspace.length > 0
  try {
    // 预建连接（增量①）：组合根自己 connect 一次 → credential 预解析传
    // applyCode（launch token 单次性—— redeem 已在预建连接消费，二次
    // redeem 必炸；E2E Node Bearer lane 无 ambient cookie 兜底）。
    const connection = await connect({
      baseUrl: window.location.origin,
      ...(launchToken !== undefined ? { launchToken } : { credential: '' }),
    })
    // B3 增量① discovery 预取：GET /execution/workspaces（已授权集，launch
    // 期冻结）。执行面未启用（404）/网络错误 → 空列表 fail-closed（不阻塞
    // 首屏，不猜测授权）。无 ambient 凭据的失败同走空列表——hint 深链仍在。
    let workspaces: Array<{ workspaceId: string }> = []
    try {
      workspaces = (await connection.listWorkspaces()).workspaces
    } catch { /* fail-closed：空列表 = 零列表选择面 */ }
    const execution = hasExecutionHint || workspaces.length > 0
      ? {
          transport: createHttpExecutionTransport({ baseUrl: window.location.origin }),
          binding: () => (hasExecutionHint ? { workspaceId: executionWorkspace as string } : null),
          ...(workspaces.length > 0 ? { workspaces } : {}),
        }
      : undefined
    await ctx.plugin({
      apply: applyCode,
      inject: ['slots'],
    }, {
      connection: {
        baseUrl: window.location.origin,
        // credential 预共享（预建连接已解析）；不再传 launchToken（单次性）。
        credential: connection.credential ?? '',
      },
      ...(initialSessionId !== undefined ? { initialSessionId } : {}),
      anchorStorage: typeof sessionStorage !== 'undefined' ? sessionStorage : null,
      // B3 设置注入（F9）：产品唯一受支持设置族 = 主题；store 结构面满足
      // web-code ThemeSettingsLike（fail-closed 校验在 web-brand host）。
      settings: { themeHost: themeStore },
      ...(execution !== undefined ? { execution } : {}),
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
