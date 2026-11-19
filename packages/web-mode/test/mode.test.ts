// T6-A Task 8 RED: web-mode mode 注册腿（Code 默认）。
import { describe, expect, test } from 'bun:test'
import { CODE_MODE, listModes, registerMode, resetModes, resolveMode } from '../src/index.ts'

describe('web-mode registry', () => {
  test('resolveMode() defaults to the Code mode', () => {
    resetModes()
    expect(resolveMode()).toEqual({ id: 'code', productTitle: 'Atlas', defaultScopeId: 'main' })
  })

  test('resolveMode("code") resolves the shipped Code mode', () => {
    resetModes()
    expect(resolveMode('code')).toBe(CODE_MODE)
  })

  test('registerMode adds a resolvable mode', () => {
    resetModes()
    const office = { id: 'office', productTitle: 'Atlas Office', defaultScopeId: 'docs' }
    registerMode(office)
    expect(resolveMode('office')).toBe(office)
  })

  test('resolveMode throws on an unknown mode id (fail-closed)', () => {
    resetModes()
    expect(() => resolveMode('comic')).toThrow(/unknown mode/)
  })

  test('listModes includes the Code default after reset', () => {
    resetModes()
    expect(listModes().map(mode => mode.id)).toEqual(['code'])
  })
})
