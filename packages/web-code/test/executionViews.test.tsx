// B 附表 §3 —— 执行面视图 SSR 腿（DOM-free，react-dom/server）。
// gate 判据：probe ≠ ready → 零渲染（不是 disabled 占位）；ready → 排队区 +
// 待批卡 + settled 展示 + 输入面。
import { describe, expect, test } from 'bun:test'
import { renderToString } from 'react-dom/server'
import { Composer } from '../src/views/Composer.tsx'
import { QueueList } from '../src/views/QueueList.tsx'
import { ApprovalCard } from '../src/views/ApprovalCard.tsx'
import type { ExecutionStatusModel } from '../src/execution/executionController.ts'

const status = (over: Partial<ExecutionStatusModel> = {}): ExecutionStatusModel => ({
  phase: 'ready',
  queue: { runningTurnId: null, queuedTurnIds: [] },
  pendingApprovals: [],
  settledApprovals: [],
  lastCursor: null,
  ...over,
})

const noop = () => {}

describe('Composer · probe gate', () => {
  test('phase ≠ ready（off/disabled/error/probing）→ 零渲染（空串，非占位）', () => {
    for (const phase of ['idle', 'probing', 'disabled', 'error'] as const) {
      const html = renderToString(
        <Composer
          phase={phase}
          queue={status().queue}
          pendingApprovals={[]}
          settledApprovals={[]}
          onSubmit={noop} onCancel={noop} onRemove={noop} onDecide={noop}
        />,
      )
      expect(html).toBe('')
    }
  })

  test('phase = ready → 输入面 + 发送按钮在场', () => {
    const html = renderToString(
      <Composer
        phase='ready'
        queue={status().queue}
        pendingApprovals={[]}
        settledApprovals={[]}
        onSubmit={noop} onCancel={noop} onRemove={noop} onDecide={noop}
      />,
    )
    expect(html).toContain('data-exec-composer')
    expect(html).toContain('data-exec-input')
    expect(html).toContain('data-exec-submit')
  })
})

describe('QueueList', () => {
  test('空队列零渲染；running/queued 行 + cancel/remove 按钮锚点', () => {
    expect(renderToString(<QueueList runningTurnId={null} queuedTurnIds={[]} />)).toBe('')
    const html = renderToString(
      <QueueList
        runningTurnId='t-run'
        queuedTurnIds={['t-q1', 't-q2']}
        onCancel={noop}
        onRemove={noop}
      />,
    )
    expect(html).toContain('data-exec-running="t-run"')
    expect(html).toContain('data-exec-cancel="t-run"')
    expect(html).toContain('data-exec-queued="t-q1"')
    expect(html).toContain('data-exec-remove="t-q2"')
    expect(html.indexOf('t-q1')).toBeLessThan(html.indexOf('t-q2')) // FIFO 序
  })
})

describe('ApprovalCard + settled 展示', () => {
  test('待批卡：批准/拒绝按钮携带 approvalId 锚点 + 归属 turn', () => {
    const html = renderToString(<ApprovalCard approvalId='ap-1' turnId='turn-A' onDecide={noop} />)
    expect(html).toContain('data-exec-approval="ap-1"')
    expect(html).toContain('data-exec-approval-turn="turn-A"')
    expect(html).toContain('data-exec-approve="ap-1"')
    expect(html).toContain('data-exec-deny="ap-1"')
  })

  test('settled 行展示 decision + actorId（取自 approval.settled 事件）', () => {
    const settled = [{
      approvalId: 'ap-1', turnId: 'turn-A', decision: 'denied' as const,
      actorId: 'conn-1', timestamp: 1_700_000_000_000,
    }]
    const html = renderToString(
      <Composer
        phase='ready'
        queue={status().queue}
        pendingApprovals={[{ approvalId: 'ap-2', turnId: 'turn-B' }]}
        settledApprovals={settled}
        onSubmit={noop} onCancel={noop} onRemove={noop} onDecide={noop}
      />,
    )
    expect(html).toContain('data-exec-settled="ap-1"')
    expect(html).toContain('denied')
    expect(html).toContain('conn-1')
    expect(html).toContain('data-exec-approval="ap-2"')
  })
})
