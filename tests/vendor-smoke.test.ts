import { describe, expect, test } from 'bun:test'

// T6-A Task 1 — vendor 基座 RED→GREEN（plan docs/superpowers/plans/2026-11-19-t6a-shell-port-plan.md）
// 腿 1 = R2 首腿（审计软报裁候选）：cordis 框架层在 bun test 下可加载/实例化。
// 腿 2 = vendor 双面 pin（审计焦点④）：dsh tag ddac96760b + 上游 commit 表 verbatim 随迁。
describe('T6-A Task 1: vendor foundation', () => {
  test('cordis Context boots under bun (R2 first leg)', async () => {
    const mod: any = await import('../vendor/cordis/src/index')
    expect(mod.Context).toBeTruthy()
    const ctx = new mod.Context()
    expect(typeof ctx.plugin).toBe('function')
    expect(typeof ctx.extend).toBe('function')
    ctx.extend()
  })

  test('vendor manifest dual-face pin recorded (dsh tag + upstream commits)', async () => {
    const readme = await Bun.file(new URL('../vendor/README.md', import.meta.url)).text()
    // 面 1：移植源 dsh tag
    expect(readme).toContain('dsh-v0.2.2-rc.2')
    expect(readme).toContain('ddac96760b')
    // 面 2：上游 commit 表（dsh vendor/README verbatim 随迁的九件 pin）
    for (const commit of [
      '02e691c5aa7f37f6e0b1cee7ee8f4a21c2e34507', // cosmokit
      'cf0b7e5481d0e31d10cdc30bc45c09366c332f27', // schemastery
      '0b96d9fd517b998e44e2209560c9e5f0671ce933', // cordis + loader
      '01b396240ce47cf2779c40af9bc445bb748fe112', // group + timer + logger-console
      'ed8a7755c26a27a72064a21dea036ad1d1d6833c', // hmr
    ]) {
      expect(readme).toContain(commit)
    }
  })
})
