// A3 RED: 阅读锚纯函数腿（storage 注入——SSR/浏览器双可运行）。
// 键 `atlasweb:anchor:v1:<encoded scopeId>:<encoded sessionId>`；禁用
// storage/畸形条目只降级（null/零写入），绝不抛。
import { describe, expect, test } from 'bun:test'
import { anchorKey, readAnchor, writeAnchor, type ReadingAnchor } from '../src/readingAnchor.ts'

/** In-memory Storage stub. */
function stubStorage(): Storage & { dump(): Map<string, string> } {
  const map = new Map<string, string>()
  return {
    getLength: () => map.size,
    key: () => null,
    clear: () => map.clear(),
    removeItem: key => { map.delete(key) },
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, String(value)) },
    dump: () => map,
  }
}

describe('readingAnchor', () => {
  test('write then read round-trips the anchor under the versioned key', () => {
    const storage = stubStorage()
    const anchor: ReadingAnchor = { messageId: 'm180', offsetPx: 42 }
    writeAnchor(storage, 'main', 'long-0360', anchor)
    expect(storage.dump().keys().next().value).toBe('atlasweb:anchor:v1:main:long-0360')
    expect(readAnchor(storage, 'main', 'long-0360')).toEqual(anchor)
  })

  test('the key encodes scope and session ids', () => {
    expect(anchorKey('main', 'long-0360')).toBe('atlasweb:anchor:v1:main:long-0360')
    expect(anchorKey('a:b', 'c/d')).toBe('atlasweb:anchor:v1:a%3Ab:c%2Fd')
  })

  test('a missing entry reads as null', () => {
    expect(readAnchor(stubStorage(), 'main', 'nope')).toBeNull()
  })

  test('a malformed entry degrades to null (no throw)', () => {
    const storage = stubStorage()
    storage.setItem('atlasweb:anchor:v1:main:s1', '{not json')
    expect(readAnchor(storage, 'main', 's1')).toBeNull()
    storage.setItem('atlasweb:anchor:v1:main:s1', '{"offsetPx":10}')
    expect(readAnchor(storage, 'main', 's1')).toBeNull()
    storage.setItem('atlasweb:anchor:v1:main:s1', '{"messageId":"","offsetPx":10}')
    expect(readAnchor(storage, 'main', 's1')).toBeNull()
  })

  test('A4-final: a negative finite offset is preserved (anchor row straddles the viewport top); non-number degrades to 0', () => {
    // 长行（高代码块等）中段刷新时锚行顶在视口上方 → offsetPx 为负是合法
    // 保真值；clamp 到 0 会跳回行首丢行内位置（reviewer Fix 4）。
    const storage = stubStorage()
    storage.setItem('atlasweb:anchor:v1:main:s1', '{"messageId":"m1","offsetPx":-120}')
    expect(readAnchor(storage, 'main', 's1')).toEqual({ messageId: 'm1', offsetPx: -120 })
    storage.setItem('atlasweb:anchor:v1:main:s1', '{"messageId":"m1","offsetPx":"12"}')
    expect(readAnchor(storage, 'main', 's1')).toEqual({ messageId: 'm1', offsetPx: 0 })
    storage.setItem('atlasweb:anchor:v1:main:s1', '{"messageId":"m1","offsetPx":null}')
    expect(readAnchor(storage, 'main', 's1')).toEqual({ messageId: 'm1', offsetPx: 0 })
  })

  test('a disabled storage (throwing) degrades silently on write and read', () => {
    const blocked: Storage = {
      getLength: () => 0,
      key: () => null,
      clear: () => {},
      removeItem: () => {},
      getItem: () => { throw new Error('storage disabled') },
      setItem: () => { throw new Error('storage disabled') },
    }
    expect(readAnchor(blocked, 'main', 's1')).toBeNull()
    expect(() => writeAnchor(blocked, 'main', 's1', { messageId: 'm1', offsetPx: 0 })).not.toThrow()
  })

  test('a null storage is a no-op face (SSR)', () => {
    expect(readAnchor(null, 'main', 's1')).toBeNull()
    expect(() => writeAnchor(null, 'main', 's1', { messageId: 'm1', offsetPx: 0 })).not.toThrow()
  })
})
