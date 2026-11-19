// Ported from dsh@dsh-v0.2.2-rc.2 packages/client/store/tests/store.client.spec.ts
// (vitest → bun:test; vi.stubGlobal/spyOn replaced with manual global/console
// capture — no new dependencies, whitelist discipline).
import { afterEach, describe, expect, it } from 'bun:test'
import { createSnapshotStore, defineStore, shallowEqual } from '../src/index.ts'

interface State {
  a: { n: number }
  b: { list: string[] }
}

const init = (): State => ({ a: { n: 1 }, b: { list: ['x'] } })

const recorder = () => {
  const calls: unknown[][] = []
  const fn = (...args: unknown[]) => { calls.push(args) }
  return Object.assign(fn, { calls })
}

let frame: FrameRequestCallback[] = []
const nativeRaf = globalThis.requestAnimationFrame
let savedEnv: string | undefined
let savedStorage: unknown
const consoleCalls: unknown[][] = []
const nativeConsoleError = console.error

afterEach(() => {
  ;(globalThis as any).requestAnimationFrame = nativeRaf
  if (savedEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = savedEnv
  savedEnv = undefined
  ;(globalThis as any).localStorage = savedStorage
  savedStorage = undefined
  console.error = nativeConsoleError
  consoleCalls.length = 0
})

const stubRaf = () => {
  frame = []
  ;(globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => {
    frame.push(cb)
    return frame.length
  }
}
const stubEnv = (value: string) => {
  savedEnv = process.env.NODE_ENV
  process.env.NODE_ENV = value
}
const stubStorage = (impl: Record<string, unknown>) => {
  savedStorage = (globalThis as any).localStorage
  ;(globalThis as any).localStorage = impl
}
const captureConsoleError = () => {
  console.error = ((...args: unknown[]) => { consoleCalls.push(args) }) as typeof console.error
}

describe('createSnapshotStore', () => {
  it('applies update through a draft and preserves untouched branch references', () => {
    const store = createSnapshotStore(init())
    const before = store.getSnapshot()
    store.update((d) => { d.a.n = 2 })
    const after = store.getSnapshot()
    expect(after).not.toBe(before)
    expect(after.a.n).toBe(2)
    expect(after.b).toBe(before.b)
  })

  it('notifies synchronously per update by default', () => {
    const store = createSnapshotStore(init())
    const seen: number[] = []
    store.subscribe(() => { seen.push(store.getSnapshot().a.n) })
    store.update((d) => { d.a.n = 2 })
    store.update((d) => { d.a.n = 3 })
    expect(seen).toEqual([2, 3])
  })

  it('coalesces a frame of updates into one notification in raf mode', () => {
    stubRaf()
    const store = createSnapshotStore(init(), { flush: 'raf' })
    const spy = recorder()
    store.subscribe(spy as () => void)
    store.update((d) => { d.a.n = 2 })
    store.update((d) => { d.a.n = 3 })
    store.update((d) => { d.b.list.push('y') })
    expect(spy.calls).toHaveLength(0)
    expect(frame).toHaveLength(1)
    frame.shift()!(0)
    expect(spy.calls).toHaveLength(1)
    expect(store.getSnapshot().a.n).toBe(3)
    // Next frame batches independently.
    store.update((d) => { d.a.n = 4 })
    expect(frame).toHaveLength(1)
    frame.shift()!(0)
    expect(spy.calls).toHaveLength(2)
  })

  it('falls back to microtask batching in raf mode without requestAnimationFrame', async () => {
    ;(globalThis as any).requestAnimationFrame = undefined
    const store = createSnapshotStore(init(), { flush: 'raf' })
    const spy = recorder()
    store.subscribe(spy as () => void)
    store.update((d) => { d.a.n = 2 })
    store.update((d) => { d.a.n = 3 })
    expect(spy.calls).toHaveLength(0)
    await Promise.resolve()
    expect(spy.calls).toHaveLength(1)
  })

  it('unsubscribes raf-mode listeners', () => {
    stubRaf()
    const store = createSnapshotStore(init(), { flush: 'raf' })
    const spy = recorder()
    const off = store.subscribe(spy as () => void)
    store.update((d) => { d.a.n = 2 })
    off()
    frame.shift()!(0)
    expect(spy.calls).toHaveLength(0)
  })

  it('replaces state wholesale via set and freezes it outside production', () => {
    const store = createSnapshotStore(init())
    const next = init()
    store.set(next)
    expect(store.getSnapshot()).toBe(next)
    expect(() => { (store.getSnapshot().a).n = 9 }).toThrow()
  })

  it('freezes the owned envelope without traversing opaque object handles', () => {
    class OpaqueHandle {
      readonly value = { n: 1 }
    }
    const handle = new OpaqueHandle()
    const store = createSnapshotStore({ handle, values: new Set(['x']) })

    store.set({ handle, values: new Set(['y']) })

    const snapshot = store.getSnapshot()
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.handle)).toBe(false)
    expect(() => { snapshot.values.add('z') }).toThrow()
  })

  it('freezes update produce output outside production (immer dev freeze)', () => {
    const store = createSnapshotStore(init())
    store.update((d) => { d.a.n = 2 })
    expect(() => { (store.getSnapshot().a).n = 9 }).toThrow()
  })

  it('does not deep-freeze wholesale state in production', () => {
    stubEnv('production')
    const store = createSnapshotStore(init())
    const next = init()
    store.set(next)

    next.a.n = 9
    expect(store.getSnapshot().a.n).toBe(9)
  })

  it('rehydrates primitive state whole, not spread into index keys', () => {
    const backing = new Map<string, string>()
    stubStorage({
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => { backing.set(k, v) },
      removeItem: (k: string) => { backing.delete(k) },
    })
    const store = createSnapshotStore<string>('', { persist: { name: 'spec-draft' } })
    store.set('hello')
    const revived = createSnapshotStore<string>('', { persist: { name: 'spec-draft' } })
    expect(revived.getSnapshot()).toBe('hello')
  })

  it('persists to localStorage under the given name and rehydrates', () => {
    const backing = new Map<string, string>()
    stubStorage({
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => { backing.set(k, v) },
      removeItem: (k: string) => { backing.delete(k) },
    })
    const store = createSnapshotStore(init(), { persist: { name: 'spec-store' } })
    store.update((d) => { d.a.n = 42 })
    expect(backing.has('spec-store')).toBe(true)
    const revived = createSnapshotStore(init(), { persist: { name: 'spec-store' } })
    expect(revived.getSnapshot().a.n).toBe(42)
  })

  it('reports rehydration failures without preventing store creation', () => {
    const failure = new Error('storage read failed')
    stubStorage({
      getItem: () => { throw failure },
      setItem: () => {},
      removeItem: () => {},
    })
    captureConsoleError()

    const store = createSnapshotStore(init(), { persist: { name: 'spec-broken-read' } })

    expect(store.getSnapshot()).toEqual(init())
    expect(consoleCalls[0]).toEqual([
      "snapshot store 'spec-broken-read' rehydration failed:",
      failure,
    ])
  })

  it('reports persistence failures without rejecting the write', () => {
    const failure = new Error('storage write failed')
    stubStorage({
      getItem: () => null,
      setItem: () => { throw failure },
      removeItem: () => {},
    })
    captureConsoleError()
    const store = createSnapshotStore(init(), { persist: { name: 'spec-broken-write' } })

    expect(() => { store.update((draft) => { draft.a.n = 7 }) }).not.toThrow()
    expect(store.getSnapshot().a.n).toBe(7)
    expect(consoleCalls[0]).toEqual([
      "snapshot store 'spec-broken-write' persistence failed:",
      failure,
    ])
  })
})

describe('defineStore', () => {
  const declare = () => defineStore({
    init: () => ({ selection: null as string | null, draft: '' }),
    actions: {
      select: (d, target: string) => { d.selection = target },
      setDraft: (d, text: string) => { d.draft = text },
      clearDraft: (d) => { d.draft = '' },
    },
  })

  it('create() yields a live instance: fresh init state, selector-visible action writes', () => {
    const inst = declare().create()
    expect(inst.getSnapshot()).toEqual({ selection: null, draft: '' })
    const listener = recorder()
    const unsubscribe = inst.subscribe(listener as () => void)
    inst.actions.setDraft('hello')
    inst.actions.select('m1')
    expect(inst.store.getSnapshot()).toEqual({ selection: 'm1', draft: 'hello' })
    expect(listener.calls).toHaveLength(2)
    unsubscribe()
    inst.actions.clearDraft()
    expect(inst.store.getSnapshot().draft).toBe('')
    expect(listener.calls).toHaveLength(2)
  })

  it('bakes draft-stripped actions that write through update (draft mutation, not replacement)', () => {
    const inst = declare().create()
    const before = inst.store.getSnapshot()
    inst.actions.setDraft('x')
    const after = inst.store.getSnapshot()
    expect(after).not.toBe(before)
    expect(after.selection).toBe(before.selection) // untouched branch preserved (immer path)
  })

  it('creates independent instances per create() call (the handle is a spec, not a singleton)', () => {
    const handle = declare()
    const a = handle.create()
    const b = handle.create()
    a.actions.setDraft('only-a')
    expect(b.store.getSnapshot().draft).toBe('')
  })

  it('suffixes the persist key with the scope key: per-session persistence plus clearPersisted cleanup', () => {
    const backing = new Map<string, string>()
    stubStorage({
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => { backing.set(k, v) },
      removeItem: (k: string) => { backing.delete(k) },
    })
    const handle = defineStore({
      init: () => ({ draft: '' }),
      persist: 'spec.chat',
      actions: { setDraft: (d, text: string) => { d.draft = text } },
    })
    handle.create('s1').actions.setDraft('one')
    handle.create('s2').actions.setDraft('two')
    handle.create().actions.setDraft('root')
    expect(JSON.parse(backing.get('spec.chat.s1')!)).toEqual({ draft: 'one' })
    expect(JSON.parse(backing.get('spec.chat.s2')!)).toEqual({ draft: 'two' })
    expect(JSON.parse(backing.get('spec.chat')!)).toEqual({ draft: 'root' })
    // Rehydration honors the same suffixed key.
    expect(handle.create('s1').store.getSnapshot().draft).toBe('one')
    // Scope-death cleanup removes exactly the suffixed key.
    handle.create('s1').clearPersisted()
    expect(backing.has('spec.chat.s1')).toBe(false)
    expect(backing.has('spec.chat.s2')).toBe(true)
    expect(backing.has('spec.chat')).toBe(true)
  })

  it('clearPersisted is a no-op without a persist declaration or without storage', () => {
    const inst = declare().create('s1') // no persist key declared
    expect(() => { inst.clearPersisted() }).not.toThrow()
    const persisting = defineStore({
      init: () => ({ n: 0 }),
      persist: 'spec.nostorage',
      actions: { inc: (d) => { d.n += 1 } },
    }).create()
    // DOM-less lane: localStorage may exist here, so simulate its absence.
    stubStorage(undefined)
    expect(() => { persisting.clearPersisted() }).not.toThrow()
  })

  it('swallows storage failures in clearPersisted (same non-fatal contract as persistence)', () => {
    stubStorage({
      getItem: () => null,
      setItem: () => {},
      removeItem: () => { throw new Error('quota / private mode') },
    })
    const inst = defineStore({
      init: () => ({ n: 0 }),
      persist: 'spec.throwing',
      actions: { inc: (d) => { d.n += 1 } },
    }).create()
    expect(() => { inst.clearPersisted() }).not.toThrow()
  })
})

describe('shallowEqual', () => {
  it('matches one-level-equal objects and rejects deeper drift', () => {
    const leaf = { deep: 1 }
    expect(shallowEqual({ x: 1, y: leaf }, { x: 1, y: leaf })).toBe(true)
    expect(shallowEqual({ x: 1, y: { deep: 1 } }, { x: 1, y: { deep: 1 } })).toBe(false)
    expect(shallowEqual([1, 2], [1, 2])).toBe(true)
    expect(shallowEqual([1, 2], [2, 1])).toBe(false)
  })
})
