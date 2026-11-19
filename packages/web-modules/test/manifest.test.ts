// Ported from dsh@dsh-v0.2.2-rc.2 packages/client/modules tests:
// - 'boot manifest wire' legs from tests/loader.client.spec.ts (DOM-free subset;
//   jsdom-bound legs stay on the browser lane — see wave ledger Task 2 ruling)
// - parseDshClient validation legs per src/client/manifest.ts contract.
import { describe, expect, it } from 'bun:test'
import { parseBootManifest, parseDshClient, readRelease } from '../src/client/manifest.ts'

describe('boot manifest wire', () => {
  it('normalizes absent shared-module fields and carries the declared ones', () => {
    const manifest = parseBootManifest({
      rev: 'graph',
      entries: [
        { id: 'a', url: 'plugins/a/client.js', rev: '1', inject: ['b'] },
        { id: 'b', url: 'plugins/b/client.js', rev: '2', external: ['react'] },
      ],
      batches: [{ phase: 'application', url: 'batch.js', rev: 'batch', entries: ['a', 'b'] }],
    })
    expect(manifest.modules).toEqual([
      { id: 'a', url: 'plugins/a/client.js', initialUrl: 'batch.js', rev: '1', inject: ['b'], external: [] },
      { id: 'b', url: 'plugins/b/client.js', initialUrl: 'batch.js', rev: '2', inject: [], external: ['react'] },
    ])
  })

  it('rejects a non-array external', () => {
    expect(() => parseBootManifest({
      rev: 'graph',
      entries: [{ id: 'a', url: '/a', rev: '1', external: 'react' }],
      batches: [{ phase: 'application', url: '/batch.js', rev: 'batch', entries: ['a'] }],
    })).toThrow('client-modules: boot manifest entry "a" external must be a string array')
  })

  it('requires the batch table', () => {
    expect(() => parseBootManifest({ rev: 'graph', entries: [] }))
      .toThrow('client-modules: boot manifest batches must be an array')
  })

  it('carries an optional Host release and rejects a malformed one', () => {
    const wire = { rev: 'graph', entries: [], batches: [] }
    expect(parseBootManifest(wire)).not.toHaveProperty('release')
    expect(parseBootManifest({ ...wire, release: { version: '1.0.0' } }).release).toEqual({ version: '1.0.0' })
    // Members outside the identity are dropped so equality compares only version and commit.
    expect(parseBootManifest({ ...wire, release: { version: '1.0.0', commit: 'abc1234', label: 'x' } }).release)
      .toEqual({ version: '1.0.0', commit: 'abc1234' })
    for (const release of ['1.0.0', null, {}, { version: 1 }, { version: '1.0.0', commit: 7 }]) {
      expect(() => parseBootManifest({ ...wire, release }))
        .toThrow('client-modules: boot manifest release must carry a string version and an optional string commit')
      // Release comparison reads no further than the release and reports an unreadable one as absent.
      expect(readRelease({ release })).toBeUndefined()
    }
    expect(readRelease({ release: { version: '1.0.0', commit: 'abc1234', label: 'x' }, entries: 'another format' }))
      .toEqual({ version: '1.0.0', commit: 'abc1234' })
    expect(readRelease(null)).toBeUndefined()
  })

  it('rejects malformed batch phases', () => {
    const entry = { id: 'a', url: '/a.js', rev: '1' }
    expect(() => parseBootManifest({ rev: 'graph', entries: [entry], batches: [null] }))
      .toThrow('client-modules: boot manifest batch is not an object')
    expect(() => parseBootManifest({
      rev: 'graph', entries: [entry], batches: [{ phase: 'idle', url: '/b.js', rev: 'b', entries: ['a'] }],
    })).toThrow('boot manifest batch phase must be "bootstrap" or "application"')
  })

  it('rejects duplicate batch URLs', () => {
    expect(() => parseBootManifest({
      rev: 'graph',
      entries: [
        { id: 'a', url: '/a.js', rev: '1' },
        { id: 'b', url: '/b.js', rev: '2' },
      ],
      batches: [
        { phase: 'application', url: '/combo.js', rev: '1', entries: ['a'] },
        { phase: 'application', url: '/combo.js', rev: '2', entries: ['b'] },
      ],
    })).toThrow('boot manifest carries duplicate batch URL "/combo.js"')
  })

  it('allows several batches in one scheduling phase', () => {
    const manifest = parseBootManifest({
      rev: 'graph',
      entries: [
        { id: 'a', url: '/a.js', rev: '1' },
        { id: 'b', url: '/b.js', rev: '2' },
      ],
      batches: [
        { phase: 'application', url: '/b.js', rev: '1', entries: ['a'] },
        { phase: 'application', url: '/c.js', rev: '2', entries: ['b'] },
      ],
    })
    expect(manifest.modules.map(row => row.initialUrl)).toEqual(['/b.js', '/c.js'])
  })

  it('requires complete batch fields and non-empty entries', () => {
    const entry = { id: 'a', url: '/a.js', rev: '1' }
    expect(() => parseBootManifest({
      rev: 'graph', entries: [entry], batches: [{ phase: 'application', entries: ['a'] }],
    })).toThrow('boot manifest application batch must carry string url/rev')
    expect(() => parseBootManifest({
      rev: 'graph', entries: [entry], batches: [{ phase: 'application', url: '/b.js', rev: 'b', entries: [] }],
    })).toThrow('boot manifest application batch entries must be a non-empty string array')
  })

  it('requires a one-to-one batch assignment over graph entries', () => {
    const entries = [
      { id: 'a', url: '/a.js', rev: '1' },
      { id: 'b', url: '/b.js', rev: '2' },
    ]
    expect(() => parseBootManifest({
      rev: 'graph',
      entries,
      batches: [{ phase: 'application', url: '/batch.js', rev: 'b', entries: ['ghost'] }],
    })).toThrow('boot manifest application batch names unknown entry "ghost"')
    expect(() => parseBootManifest({
      rev: 'graph',
      entries,
      batches: [
        { phase: 'bootstrap', url: '/boot.js', rev: 'boot', entries: ['a'] },
        { phase: 'application', url: '/batch.js', rev: 'app', entries: ['a', 'b'] },
      ],
    })).toThrow('boot manifest entry "a" belongs to more than one batch')
    expect(() => parseBootManifest({
      rev: 'graph',
      entries,
      batches: [{ phase: 'application', url: '/batch.js', rev: 'b', entries: ['a'] }],
    })).toThrow('boot manifest entry "b" belongs to no initial-load batch')
  })
})

describe('parseDshClient', () => {
  it('returns undefined for an absent declaration and validates the present shape', () => {
    expect(parseDshClient('pkg', undefined)).toBeUndefined()
    expect(parseDshClient('pkg', { platform: 'web' })).toEqual({ platform: 'web' })
    expect(parseDshClient('pkg', { platform: 'web', inject: ['a'], external: ['b'], immediately: true }))
      .toEqual({ platform: 'web', inject: ['a'], external: ['b'], immediately: true })
  })

  it('rejects non-object declarations and a missing string platform', () => {
    expect(() => parseDshClient('pkg', 'web')).toThrow('client-modules: pkg has a non-object dsh.client declaration')
    expect(() => parseDshClient('pkg', null)).toThrow('client-modules: pkg has a non-object dsh.client declaration')
    expect(() => parseDshClient('pkg', {})).toThrow('client-modules: pkg dsh.client.platform must be a string')
  })

  it('validates inject/external as string arrays and immediately as boolean', () => {
    expect(() => parseDshClient('pkg', { platform: 'web', inject: 'a' }))
      .toThrow('client-modules: pkg dsh.client.inject must be a string array')
    expect(() => parseDshClient('pkg', { platform: 'web', external: [1] }))
      .toThrow('client-modules: pkg dsh.client.external must be a string array')
    expect(() => parseDshClient('pkg', { platform: 'web', immediately: 'yes' }))
      .toThrow('client-modules: pkg dsh.client.immediately must be a boolean')
  })
})
