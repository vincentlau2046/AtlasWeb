// T6-A Task 8 RED: RF5 虚拟化有界腿——可见窗计算纯函数（DOM 有界判据的核）。
import { describe, expect, test } from 'bun:test'
import { computeVisibleRange, REPLAY_WINDOW_SIZE } from '../src/windowing.ts'

describe('computeVisibleRange — bounded windowing (RF5)', () => {
  test('at scrollTop 0 the window starts at the head and stays bounded', () => {
    const range = computeVisibleRange(500, 0, 600, 24)
    expect(range.start).toBe(0)
    expect(range.end).toBeGreaterThan(0)
    expect(range.end - range.start).toBeLessThanOrEqual(REPLAY_WINDOW_SIZE + 20)
  })

  test('a mid-scroll window stays inside the list and bounded', () => {
    const range = computeVisibleRange(500, 6000, 600, 24)
    expect(range.start).toBeGreaterThan(0)
    expect(range.end).toBeLessThanOrEqual(500)
    expect(range.end - range.start).toBeLessThanOrEqual(REPLAY_WINDOW_SIZE + 20)
  })

  test('the window clamps to short lists', () => {
    expect(computeVisibleRange(10, 0, 600, 24)).toEqual({ start: 0, end: 10 })
  })

  test('the window clamps when the scroll position overshoots the content', () => {
    const range = computeVisibleRange(500, 999_999, 600, 24)
    expect(range.end).toBe(500)
    expect(range.start).toBeLessThan(500)
  })

  test('a zero row height guards division and returns a bounded head window', () => {
    const range = computeVisibleRange(500, 3000, 600, 0)
    expect(range.start).toBe(0)
    expect(range.end - range.start).toBeLessThanOrEqual(REPLAY_WINDOW_SIZE + 20)
  })

  test('the range is never inverted', () => {
    for (const scrollTop of [0, 1_000, 10_000, 100_000]) {
      const { start, end } = computeVisibleRange(137, scrollTop, 300, 24)
      expect(start).toBeGreaterThanOrEqual(0)
      expect(end).toBeLessThanOrEqual(137)
      expect(end).toBeGreaterThanOrEqual(start)
    }
  })
})
