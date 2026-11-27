// B3 切片（工单 docs/2026-11-27-b3-deliverables-status-settings-wave.md §3 门1）
// 三新视图 SSR 形断言：StatusStrip（产品状态条）/ DeliverablesCard（交付物卡，
// F8 不造假——只基于 ConversationModel 真实输出 + 差异登记明示）/ SettingsPanel
// （F9 无空壳开关——只渲染注入的受支持设置面，host 缺席零渲染 fail-closed）。
import { describe, expect, test } from 'bun:test'
import { renderToString } from 'react-dom/server'
import { StatusStrip, type StatusStripProps } from '../src/views/StatusStrip.tsx'
import { DeliverablesCard } from '../src/views/DeliverablesCard.tsx'
import { SettingsPanel, type ThemeSettingsLike } from '../src/settings/settingsPanel.tsx'
import type { ExecutionStatusModel } from '../src/execution/executionController.ts'
import { emptyConversation } from '../src/projection.ts'

function status(over: Partial<ExecutionStatusModel> = {}): ExecutionStatusModel {
  return {
    phase: 'ready',
    queue: { runningTurnId: null, queuedTurnIds: [] },
    pendingApprovals: [],
    settledApprovals: [],
    lastCursor: null,
    ...over,
  }
}

describe('B3 StatusStrip（shell.bottom 产品状态条）', () => {
  test('renders phase + running turn + pending approvals', () => {
    const html = renderToString(
      <StatusStrip
        status={status({
          queue: { runningTurnId: 'turn-1', queuedTurnIds: ['t2'] },
          pendingApprovals: [{ approvalId: 'a1', turnId: 'turn-1' }],
        })}
      />,
    )
    expect(html).toContain('data-status-strip')
    expect(html).toContain('data-strip-phase="ready"')
    expect(html).toContain('data-strip-running="turn-1"')
    expect(html).toContain('data-strip-queued="1"')
    expect(html).toContain('data-strip-pending="1"')
  })

  test('surfaces stream/command errors distinctly', () => {
    const html = renderToString(
      <StatusStrip status={status({ streamError: { code: 'stream', message: 'broken' } })} />,
    )
    expect(html).toContain('data-strip-stream-error')
    const html2 = renderToString(
      <StatusStrip status={status({ error: { code: 'denied', message: 'no' } })} />,
    )
    expect(html2).toContain('data-strip-error')
  })

  test('idle phase renders strip with idle marker (mounted only when execution channel exists)', () => {
    const html = renderToString(<StatusStrip status={status({ phase: 'idle' })} />)
    expect(html).toContain('data-status-strip')
    expect(html).toContain('data-strip-phase="idle"')
  })
})

describe('B3 DeliverablesCard（F8 转录推导 · 不造假）', () => {
  test('empty conversation → zero render', () => {
    expect(renderToString(<DeliverablesCard conversation={emptyConversation('s1')} />)).toBe('')
  })

  test('derives from real kernel output: activity count + last assistant text + derived-source notice', () => {
    const conversation = {
      ...emptyConversation('s1'),
      messages: [
        {
          id: 'm1', role: 'user' as const, createdAt: 1,
          blocks: [{ kind: 'text' as const, text: 'make a file' }],
        },
        {
          id: 'm2', role: 'assistant' as const, createdAt: 2,
          blocks: [
            { kind: 'activity' as const, label: 'Write' },
            { kind: 'activity' as const, label: 'Bash' },
            { kind: 'text' as const, text: 'Done — created hello.ts and ran the tests.' },
          ],
        },
      ],
    }
    const html = renderToString(<DeliverablesCard conversation={conversation} />)
    expect(html).toContain('data-deliverables')
    expect(html).toContain('data-deliverables-activities="2"')
    expect(html).toContain('data-deliverables-summary')
    expect(html).toContain('Done — created hello.ts')
    // F8 差异登记明示（工单 §4）：卡面自陈「转录推导」，不虚构文件清单
    expect(html).toContain('data-deliverables-derived')
  })
})

describe('B3 SettingsPanel（F9 只展示受支持设置有效值）', () => {
  const host = (snapshot?: Partial<{ preference: string; fontSize: number; codeFontSize: number; terminalFontSize: number }>): ThemeSettingsLike => ({
    getSnapshot: () => ({
      preference: 'system', fontSize: 16, codeFontSize: 13, terminalFontSize: 13,
      textFontFamily: '', codeFontFamily: '', terminalFontFamily: '', ...snapshot,
    }),
    set: () => {},
    subscribe: () => () => {},
  })

  test('no host injected → zero render (fail-closed, 无空壳开关)', () => {
    expect(renderToString(<SettingsPanel themeHost={null} />)).toBe('')
  })

  test('renders only supported settings with current valid values', () => {
    const html = renderToString(
      <SettingsPanel themeHost={host({ preference: 'dark', fontSize: 18 })} defaultOpen />,
    )
    expect(html).toContain('data-settings-panel')
    expect(html).toContain('data-settings-preference="dark"')
    expect(html).toContain('data-settings-field="fontSize"')
    expect(html).toContain('18')
    // 受支持值域三支在场（light|dark|system）
    expect(html).toContain('data-settings-option="light"')
    expect(html).toContain('data-settings-option="dark"')
    expect(html).toContain('data-settings-option="system"')
  })

  test('closed by default: toggle present, panel absent', () => {
    const html = renderToString(<SettingsPanel themeHost={host()} />)
    expect(html).toContain('data-settings-toggle')
    expect(html).not.toContain('data-settings-panel')
  })
})

// StatusStripProps 面冻结（视图纯投影 props 形，惯例对齐 QueueListProps）
type _PropsCheck = StatusStripProps

// —— B3 增量①：WorkspaceListPanel（发现列表选择 UI；选择 ≠ 授权纪律）——
import { WorkspaceListPanel } from '../src/views/WorkspaceListPanel.tsx'

describe('B3 WorkspaceListPanel（增量① 发现列表）', () => {
  test('列表渲染：data-workspace-list + 逐项 option 锚点 + 选中标记', () => {
    const html = renderToString(
      <WorkspaceListPanel
        workspaces={[{ workspaceId: 'ws-a' }, { workspaceId: 'ws-b' }]}
        selectedId='ws-b'
        onSelect={() => {}}
      />,
    )
    expect(html).toContain('data-workspace-list')
    expect(html).toContain('data-workspace-option="ws-a"')
    expect(html).toContain('data-workspace-option="ws-b"')
    expect(html).toContain('data-workspace-selected="ws-b"')
    expect(html).not.toContain('data-workspace-selected="ws-a"')
  })

  test('无选中：零 selected 标记；空列表 → 零渲染（fail-closed 非占位）', () => {
    const none = renderToString(
      <WorkspaceListPanel workspaces={[{ workspaceId: 'ws-a' }]} selectedId={null} onSelect={() => {}} />,
    )
    expect(none).toContain('data-workspace-option="ws-a"')
    expect(none).not.toContain('data-workspace-selected')
    expect(renderToString(<WorkspaceListPanel workspaces={[]} selectedId={null} onSelect={() => {}} />)).toBe('')
  })
})
