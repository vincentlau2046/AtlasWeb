// Ported from dsh@dsh-v0.2.2-rc.2 packages/client/modules/tests/loader.client.spec.ts
// 'Cordis plugin face' leg (DOM-free subset; jsdom-bound legs stay on the
// browser lane — see wave ledger Task 2 ruling). This leg also exercises the
// vendored cordis scoped-name resolution under bun (tsconfig paths → vendor/).
import { describe, expect, it } from 'bun:test'
import { Context } from '@deepseek-ai/cordis'
import { apply } from '../src/client/index.ts'

describe('Cordis plugin face', () => {
  it('rejects a Loader whose internal is absent or not a client module system', () => {
    for (const internal of [undefined, { version: 'worker' }]) {
      const ctx = new Context()
      ctx.provide('loader', { internal } as never)
      expect(() => { apply(ctx) }).toThrow('the Loader has no client module system')
    }
  })
})
