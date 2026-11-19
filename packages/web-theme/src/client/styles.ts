// Adapted from dsh@dsh-v0.2.2-rc.2 (T6-A Task 4): verbatim（css?inline 形保留——真消费面
// = vite 构建 Task 9；bun 测试运行时 ?inline 解析为空对象，installThemeStyles 的
// document 守卫使其在无 DOM 运行时恒早退，不执行挂载）。
import type { Context } from '@deepseek-ai/cordis'
import base from '../styles/base.css?inline'
import cornerShape from '../styles/corner-shape.css?inline'
import designPlatform from '../styles/design-platform.css?inline'
import focus from '../styles/focus.css?inline'
import onboarding from '../styles/onboarding.css?inline'
import scrollbar from '../styles/scrollbar.css?inline'
import gradientShadowText from '../styles/gradient-shadow-text.css?inline'
import shiki from '../styles/shiki.css?inline'

const PLUGIN_ID = '@deepseek-ai/dsh-client-ui-theme'
const HAIRLINE_WIDTH = '--dsh-hairline-width'

const STYLES = [
  ['base.css', base],
  ['corner-shape.css', cornerShape],
  ['design-platform.css', designPlatform],
  ['focus.css', focus],
  ['onboarding.css', onboarding],
  ['scrollbar.css', scrollbar],
  ['gradient-shadow-text.css', gradientShadowText],
  ['shiki.css', shiki],
] as const

/**
 * Mount global theme sheets; window-backed documents also publish the DPR-aware stroke width.
 * @param ctx - Owning plugin context.
 */
export function installThemeStyles(ctx: Context): void {
  if (typeof document === 'undefined') return
  const view = document.defaultView
  if (view !== null) ctx.effect(() => {
    const root = document.documentElement
    const previousWidth = root.style.getPropertyValue(HAIRLINE_WIDTH)
    const previousPriority = root.style.getPropertyPriority(HAIRLINE_WIDTH)
    const matchMedia = typeof view.matchMedia === 'function' ? view.matchMedia.bind(view) : undefined
    let resolution: MediaQueryList | undefined
    const updateStroke = (): void => {
      // Positive borders round down to whole device pixels, with a one-pixel minimum.
      const dpr = view.devicePixelRatio
      const width = Math.max(1, Math.floor(0.5 * dpr)) / dpr
      root.style.setProperty(HAIRLINE_WIDTH, `${width}px`)
      resolution?.removeEventListener('change', updateStroke)
      resolution = matchMedia?.(`(resolution: ${dpr}dppx)`)
      resolution?.addEventListener('change', updateStroke)
    }
    updateStroke()
    return () => {
      resolution?.removeEventListener('change', updateStroke)
      if (previousWidth === '') root.style.removeProperty(HAIRLINE_WIDTH)
      else root.style.setProperty(HAIRLINE_WIDTH, previousWidth, previousPriority)
    }
  }, 'ui-theme: DPR-aware hairline width')
  for (const [name, css] of STYLES) {
    ctx.effect(() => {
      const tag = document.createElement('style')
      tag.dataset.plugin = PLUGIN_ID
      tag.dataset.pluginCss = `${PLUGIN_ID}/${name}`
      tag.textContent = css
      document.head.appendChild(tag)
      return () => { tag.remove() }
    }, `ui-theme: ${name} stylesheet`)
  }
}
