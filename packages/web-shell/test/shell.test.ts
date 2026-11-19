// T6-A Task 7: web-shell boot kernel 契约腿（RED 先行）。
// 判据 = plan Task 7：模块表投影 → loader boot 序列（stub 模块系统直驱
// vendor Loader）→ renderer handoff。DOM-free（boot-page/ThemePresenter 浏览器
// 车道债，Task 2 裁定沿用）。
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('web-shell: platform module table (Atlas form)', () => {
  test('PLATFORM_MODULES 与 seed 静态表恰合投影（键序=表序，防漂移 satisfies 契约）', async () => {
    const { PLATFORM_MODULES } = await import('../src/platform.ts')
    const { getStaticModules } = await import('../src/seed.ts')
    expect(Object.keys(getStaticModules())).toEqual([...PLATFORM_MODULES])
  })

  test('Atlas 词汇面：零 dsh 包指称、ui-dockkit 行由 @atlasweb/web-layout 最小布局宿主替位、zod/react-virtual 零消费剔除', async () => {
    const { PLATFORM_MODULES } = await import('../src/platform.ts')
    expect([...PLATFORM_MODULES]).toEqual([
      'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
      '@atlasweb/web-store', '@atlasweb/web-slots', '@atlasweb/web-primitives', '@atlasweb/web-layout',
    ])
  })
})

describe('web-shell: bootClient over vendor Loader (stub module system)', () => {
  /** stub ClientModuleLoader：import 面直返插件对象；entries.start 逐行 loader.create。 */
  function stubModules(plugins: Record<string, unknown>) {
    const errors = new Map<string, Error>()
    return {
      import: async (name: string) => {
        const value = plugins[name]
        if (value instanceof Error) { errors.set(name, value); throw value }
        return value
      },
      importError: (name: string) => errors.get(name),
      entries: {
        start: async (loader: { create: (options: { name: string }) => unknown }, manifest: { plugins: Array<{ id: string }> }) => {
          for (const row of manifest.plugins) await loader.create({ name: row.id })
        },
      },
    }
  }

  const OK = { apply: () => {} }
  const ATLAS_ENTRIES = ['@atlasweb/web-modules', '@atlasweb/web-renderer', '@atlasweb/web-layout', '@atlasweb/web-code']
  const manifest = { rev: 'test', plugins: ATLAS_ENTRIES.map(id => ({ id, inject: [] as string[], immediately: true })) }

  test('happy path: 四 Atlas 必需入口全部激活，audit 放行，状态回调 loading→active', async () => {
    const { bootClient } = await import('../src/boot-client.ts')
    const { Context } = await import('../../../vendor/cordis/src/index.ts')
    const ctx = new Context()
    const states: Array<[string, string]> = []
    await bootClient({
      ctx: ctx as never,
      modules: stubModules(Object.fromEntries(ATLAS_ENTRIES.map(id => [id, { ...OK }]))) as never,
      manifest: manifest as never,
      onEntryState: (name, state) => { states.push([name, state]) },
    })
    const finalStates = new Map(states)
    for (const id of ATLAS_ENTRIES) expect(finalStates.get(id)).toBe('active')
    ctx.fiber.dispose()
  })

  test('required 入口 import 失败 → audit 拒绝并以 (required) 标名', async () => {
    const { bootClient } = await import('../src/boot-client.ts')
    const { Context } = await import('../../../vendor/cordis/src/index.ts')
    const ctx = new Context()
    const plugins = Object.fromEntries(ATLAS_ENTRIES.map(id => [id, { ...OK }]))
    plugins['@atlasweb/web-layout'] = new Error('bundle missing')
    await expect(bootClient({
      ctx: ctx as never,
      modules: stubModules(plugins) as never,
      manifest: manifest as never,
    })).rejects.toThrow(/@atlasweb\/web-layout \(required\).*bundle missing/s)
    ctx.fiber.dispose()
  })

  test('required 入口 apply 抛错 → audit 以 activation failure 拒绝', async () => {
    const { bootClient } = await import('../src/boot-client.ts')
    const { Context } = await import('../../../vendor/cordis/src/index.ts')
    const ctx = new Context()
    const plugins = Object.fromEntries(ATLAS_ENTRIES.map(id => [id, { ...OK }]))
    plugins['@atlasweb/web-code'] = { apply: () => { throw new Error('boom') } }
    await expect(bootClient({
      ctx: ctx as never,
      modules: stubModules(plugins) as never,
      manifest: manifest as never,
    })).rejects.toThrow(/@atlasweb\/web-code \(required\).*failed: Error: boom/s)
    ctx.fiber.dispose()
  })
})

describe('web-shell: mountClient renderer handoff', () => {
  test('uiRenderer 就位 → mount effect 以依赖 fiber 安装并交出挂载点', async () => {
    const { mountClient } = await import('../src/mount.ts')
    const { Context } = await import('../../../vendor/cordis/src/index.ts')
    const ctx = new Context()
    const mounted: unknown[] = []
    const container = { ownerDocument: {} } as unknown as HTMLElement
    ctx.reflect.provide('uiRenderer', { mount: (el: HTMLElement) => { mounted.push(el) } })
    await mountClient(ctx as never, container)
    expect(mounted).toEqual([container])
    ctx.fiber.dispose()
  })
})

describe('web-shell: boot page brand surface', () => {
  test('wordmark = ATLAS（dsh HARNESS 替位；品牌面裁定）', () => {
    const text = readFileSync(join(import.meta.dir, '../src/boot-page.ts'), 'utf8')
    expect(text).toContain("'ATLAS'")
    expect(text).not.toContain("'HARNESS'")
  })
})
