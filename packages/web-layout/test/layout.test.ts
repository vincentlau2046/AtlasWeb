// T6-A Task 7: web-layout 契约腿（RED 先行）。
// DOM-free：columns 纯函数 / store 动作 / LayoutController / apply 注册形
// （effect-1 无浏览器 API 可全执行；effect-2 ThemePresenter = 浏览器车道债）。
import { describe, expect, test } from 'bun:test'
import type { MainPanelId } from '../src/client/service.ts'

const pid = (id: string) => id as unknown as MainPanelId

describe('web-layout: columns 纯函数', () => {
  test('computeColumns：右列先收缩、后失轨，中列保护最小值', async () => {
    const { computeColumns } = await import('../src/client/columns.ts')
    expect(computeColumns(1280, 280, 300)).toEqual({ sidebar: 280, center: 700, rightbar: 300 })
    expect(computeColumns(1280, 280, 500)).toEqual({ sidebar: 280, center: 500, rightbar: 500 })
    // available = 900-280-400 = 220 < RIGHTBAR_MIN → 右列失轨，中列不受最小值钳
    expect(computeColumns(900, 280, 400)).toEqual({ sidebar: 280, center: 620, rightbar: 0 })
    // 侧栏闭合 → 图标轨 collapsedWidth（默认 56）
    expect(computeColumns(1280, 0, 300)).toEqual({ sidebar: 56, center: 924, rightbar: 300 })
  })

  test('clampWidth 四舍五入并钳位', async () => {
    const { clampWidth } = await import('../src/client/columns.ts')
    expect(clampWidth(100.4, 264, 420)).toBe(264)
    expect(clampWidth(1000, 264, 420)).toBe(420)
    expect(clampWidth(300.6, 264, 420)).toBe(301)
  })
})

describe('web-layout: layout store 动作', () => {
  async function newInstance() {
    const { createLayoutStore } = await import('../src/client/stores.ts')
    return createLayoutStore().create()
  }

  test('headless 安全：init viewportWidth 守卫 window 缺席（bun 无 DOM）→ 0', async () => {
    const inst = await newInstance()
    expect(inst.getSnapshot().layoutInfo.viewportWidth).toBe(0)
  })

  test('宽帧侧栏 toggle ⟷ 合同默认宽；拖写钳位 [264, 420]', async () => {
    const inst = await newInstance()
    inst.actions.setViewportWidth(1280)
    expect(inst.getSnapshot().layoutInfo.sidebar).toBe(280)
    inst.actions.toggleSidebar()
    expect(inst.getSnapshot().layoutInfo.sidebar).toBe(0)
    inst.actions.toggleSidebar()
    expect(inst.getSnapshot().layoutInfo.sidebar).toBe(280)
    inst.actions.setSidebar(100)
    expect(inst.getSnapshot().layoutInfo.sidebar).toBe(264)
    inst.actions.setSidebar(5000)
    expect(inst.getSnapshot().layoutInfo.sidebar).toBe(420)
  })

  test('窄帧 toggle 只翻 expansion override（宽度偏好不损）；断点跨越丢弃 override', async () => {
    const inst = await newInstance()
    inst.actions.setViewportWidth(700)
    inst.actions.toggleSidebar()
    expect(inst.getSnapshot().layoutInfo.narrowExpanded).toBe(true)
    expect(inst.getSnapshot().layoutInfo.sidebar).toBe(280)
    inst.actions.setViewportWidth(1280)
    expect(inst.getSnapshot().layoutInfo.narrowExpanded).toBe(false)
  })

  test('右栏首开默认 45% 帧宽；偏好跨 close 存续；拖写钳 RIGHTBAR_MIN', async () => {
    const inst = await newInstance()
    inst.actions.setViewportWidth(1280)
    inst.actions.openRightbar(true, false)
    expect(inst.getSnapshot().layoutInfo.rightbar).toBe(Math.round(1280 * 0.45))
    expect(inst.getSnapshot().layoutInfo.rightbarShown).toBe(true)
    inst.actions.closeRightbar()
    expect(inst.getSnapshot().layoutInfo.rightbarShown).toBe(false)
    expect(inst.getSnapshot().layoutInfo.rightbar).toBe(Math.round(1280 * 0.45))
    inst.actions.setRightbar(200)
    inst.actions.openRightbar(true, false)
    expect(inst.getSnapshot().layoutInfo.rightbar).toBe(300)
  })

  test('retainMainPanels：失效选中收敛回 null（Conversation）', async () => {
    const inst = await newInstance()
    inst.actions.selectPanel(pid('p1'))
    expect(inst.getSnapshot().panelInfo.activePanelId).toBe('p1')
    inst.actions.retainMainPanels(['p2'])
    expect(inst.getSnapshot().panelInfo.activePanelId).toBeNull()
  })
})

describe('web-layout: LayoutController', () => {
  async function makeLayout() {
    const [{ createLayoutStore }, { LayoutController }] = await Promise.all([
      import('../src/client/stores.ts'),
      import('../src/client/service.ts'),
    ])
    const inst = createLayoutStore().create()
    const layout = new LayoutController(
      inst.actions,
      id => id === pid('p1'),
      { getSnapshot: () => inst.getSnapshot().panelInfo, subscribe: () => () => {} },
    )
    return { inst, layout }
  }

  test('selectPanel 路由 store；未注册面板抛错且保留当前选中', async () => {
    const { inst, layout } = await makeLayout()
    layout.selectPanel(pid('p1'))
    expect(inst.getSnapshot().panelInfo.activePanelId).toBe('p1')
    expect(() => layout.selectPanel(pid('nope'))).toThrow(/not registered/)
    expect(inst.getSnapshot().panelInfo.activePanelId).toBe('p1')
  })

  test('beginNavigation 后发先至：前一个导航信号被 abort', async () => {
    const { layout } = await makeLayout()
    const first = layout.beginNavigation()
    expect(first.aborted).toBe(false)
    const second = layout.beginNavigation()
    expect(first.aborted).toBe(true)
    expect(second.aborted).toBe(false)
  })
})

describe('web-layout: apply() 注册形（effect-1 全执行；stub ctx）', () => {
  async function stubCtx() {
    const effects: Array<{ name: string; run: () => (() => void) | void }> = []
    const calls = {
      register: [] as Array<{ options: Record<string, any>; component: unknown }>,
      provideRoot: [] as Array<Record<string, unknown>>,
      provide: [] as Array<{ name: string; value: unknown }>,
      subscribeMain: [] as unknown[],
    }
    const ctx = {
      effect: (run: () => (() => void) | void, name: string) => { effects.push({ name, run }) },
      slots: {
        entries: () => [],
        provideRoot: (hooks: Record<string, unknown>) => { calls.provideRoot.push(hooks); return () => {} },
        register: (options: Record<string, any>, component: unknown) => { calls.register.push({ options, component }); return () => {} },
        subscribe: (key: string, fn: unknown) => { if (key === 'main') calls.subscribeMain.push(fn); return () => {} },
      },
      theme: {
        getTheme: () => ({ active: { colorScheme: 'dark', tokens: {} }, preference: 'system', fontSizes: {}, fontFamilies: {} }),
      },
      reflect: {
        provide: (name: string, value: unknown) => { calls.provide.push({ name, value }); return () => {} },
      },
      on: () => () => {},
      brand: { productTitle: 'Atlas' },
    }
    return { ctx, effects, calls }
  }

  test('effect-1：root 注册（六子槽声明 + 共享 store 实例 + AppFrame 组件 + inject face 含 brand）+ provideRoot(panelInfo) + reflect.provide(layout) + main 订阅', async () => {
    const [{ apply }, { AppFrame }] = await Promise.all([
      import('../src/client/index.ts'),
      import('../src/client/AppFrame.tsx'),
    ])
    const { ctx, effects, calls } = await stubCtx()
    apply(ctx as never)
    // effect-2（ThemePresenter）浏览器车道债：只记名不执行
    expect(effects.map(e => e.name)).toEqual(['ui-layout: service + root registration', 'ui-layout: theme presenter'])
    effects[0]!.run()
    expect(calls.register).toHaveLength(1)
    const { options, component } = calls.register[0]!
    expect(options.name).toBe('root')
    expect(Object.keys(options.children)).toEqual(['sidebar', 'main', 'rightbar', 'shell.bottom', 'shell.overlay', 'shell.leading'])
    expect(typeof options.store.create).toBe('function')
    expect(options.store.create()).toBe(options.store.create())
    expect(options.inject()).toEqual({
      hooks: { foldedLandscape: expect.anything() },
      brand: { productTitle: 'Atlas' },
    })
    expect(component).toBe(AppFrame)
    expect(calls.provideRoot[0]).toMatchObject({ hooks: { panelInfo: expect.anything() } })
    expect(calls.provide).toHaveLength(1)
    expect(calls.provide[0]!.name).toBe('layout')
    expect(calls.subscribeMain).toHaveLength(1)
  })

  test('inject 面 = [slots, theme, brand]（locale/shortcuts 剥离，R5）', async () => {
    const { inject } = await import('../src/client/index.ts')
    expect(inject).toEqual(['slots', 'theme', 'brand'])
  })

  test('组件面：AppFrame / DocumentTitle 可导入（.module.css 空 keys 解析形）', async () => {
    const [{ AppFrame }, { DocumentTitle }] = await Promise.all([
      import('../src/client/AppFrame.tsx'),
      import('../src/client/DocumentTitle.tsx'),
    ])
    expect(typeof AppFrame).toBe('function')
    expect(typeof DocumentTitle).toBe('function')
  })
})
