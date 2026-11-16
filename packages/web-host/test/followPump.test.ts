import { describe, expect, test } from 'bun:test'

// followPump 单测（假 res 注入；bun fetch 急切缓冲使 socket 级背压不可测，
// 见 followStream.test.ts 腿b 注记）：
// b1 write()=false → 暂停拉取直至 drain，随后恢复（Node 真背压承载）；
// b2 write()=false + drain 恒不至 → slowConsumerMs 超限 fail-closed
//    （SlowConsumerError；订阅由调用方 finally 释放——httpHost 路由已含）；
// b3 closed 事件唯一 terminal：循环终止、零额外拉取。
import { pumpFollowEvents, SlowConsumerError } from '../src/followPump'

interface FakeResState {
  writes: string[]
  failNextWrites: number
  drainListeners: Array<() => void>
  ended: boolean
}

function fakeRes(state: FakeResState) {
  return {
    write(chunk: string): boolean {
      state.writes.push(chunk)
      if (state.failNextWrites > 0) {
        state.failNextWrites--
        return false
      }
      return true
    },
    once(event: string, cb: () => void): void {
      if (event === 'drain') state.drainListeners.push(cb)
    },
    off(): void {},
    get writableEnded(): boolean {
      return state.ended
    },
    end(): void {
      state.ended = true
    },
  }
}

const ev = (kind: string, id: string) => ({ kind, projection: { messages: [{ id }] }, schemaVersion: 0, productId: 'atlascode', scopeId: 'main', sessionId: 's', subscriptionId: 'sub1' })

function makeSub(events: Array<{ kind: string }>, hooks: { onNext?: () => void } = {}) {
  let i = 0
  let closedCount = 0
  const sub = {
    [Symbol.asyncIterator]() {
      return {
        next: async () => {
          hooks.onNext?.()
          if (i < events.length) return { done: false as const, value: events[i++]! }
          await new Promise(r => setTimeout(r, 20))
          return { done: false as const, value: ev('replacement', `tick-${i++}`) }
        },
      }
    },
    close: async () => { closedCount++ },
  }
  return { sub, closedCount: () => closedCount }
}

describe('followPump backpressure + slow consumer (fail-closed)', () => {
  test('b1 write()=false pauses pulling until drain, then resumes', async () => {
    const state: FakeResState = { writes: [], failNextWrites: 1, drainListeners: [], ended: false }
    const res = fakeRes(state)
    let pulls = 0
    const { sub } = makeSub([ev('baseline', 'm0')], { onNext: () => { pulls++ } })
    const pump = pumpFollowEvents(sub as never, res as never, { slowConsumerMs: 2000 })
    // baseline 已写出且 write=false → 暂停：200ms 内零新拉取
    await new Promise(r => setTimeout(r, 200))
    const pausedPulls = pulls
    expect(state.writes).toHaveLength(1)
    expect(pausedPulls).toBeLessThanOrEqual(1)
    await new Promise(r => setTimeout(r, 150))
    expect(pulls).toBe(pausedPulls) // 暂停期零拉取（无界形 = 持续增长）
    // drain → 恢复
    for (const cb of state.drainListeners) cb()
    await new Promise(r => setTimeout(r, 200))
    expect(pulls).toBeGreaterThan(pausedPulls)
    // 终止泵（b1 只验背压，不待 closed）
    state.ended = true
    await pump.catch(() => {})
  })

  test('b2 drain never fires → slowConsumerMs timeout fails closed', async () => {
    const state: FakeResState = { writes: [], failNextWrites: 1, drainListeners: [], ended: false }
    const res = fakeRes(state)
    const { sub, closedCount } = makeSub([ev('baseline', 'm0')])
    let threw: unknown
    try {
      await pumpFollowEvents(sub as never, res as never, { slowConsumerMs: 120 })
    } catch (e) {
      threw = e
    }
    expect(threw).toBeInstanceOf(SlowConsumerError)
    // fail-closed：订阅释放由路由 finally 承载（此处直验 close 可调）
    await sub.close()
    expect(closedCount()).toBe(1)
  })

  test('b3 closed event is the unique terminal — loop ends with zero extra pulls', async () => {
    const state: FakeResState = { writes: [], failNextWrites: 0, drainListeners: [], ended: false }
    const res = fakeRes(state)
    let pulls = 0
    const { sub } = makeSub([ev('baseline', 'm0'), { kind: 'closed' }], { onNext: () => { pulls++ } })
    await pumpFollowEvents(sub as never, res as never, { slowConsumerMs: 1000 })
    expect(state.writes).toHaveLength(2) // baseline + closed 两帧
    expect(pulls).toBe(2) // closed 后零额外拉取
  })
})
