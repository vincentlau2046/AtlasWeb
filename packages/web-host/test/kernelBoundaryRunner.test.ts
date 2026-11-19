import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

// T6-A 波终门（审计条件：收口门 runner 落仓，Atlas-reveiw verdict 2026-11-20）
// ——kernel 边界 violation=0 必须是第三方一条命令可复现面，不得依赖 ad hoc
// runner。本腿把落仓脚本接进套件：脚本自身 fail-closed（scanner 源缺席 /
// 扫描违规 / 证据装配失败均非零退出），套件腿断言 allowed=true。
// scanner 单一事实源 = 配对仓 AtlasCode scripts/atlasweb-kernel-boundary-scan.ts
//（ATLASCODE_ROOT 可覆写；不 vendored 不手拷——拷贝即漂移面）。

const repoRoot = join(import.meta.dir, '..', '..', '..')
const runnerPath = join(repoRoot, 'scripts', 'verify-kernel-boundary.ts')

function resolveScannerRoot(): string | null {
  if (process.env.ATLASCODE_ROOT !== undefined) {
    return existsSync(join(process.env.ATLASCODE_ROOT, 'scripts', 'atlasweb-kernel-boundary-scan.ts'))
      ? process.env.ATLASCODE_ROOT
      : null
  }
  const sibling = join(repoRoot, '..', 'AtlasCode')
  return existsSync(join(sibling, 'scripts', 'atlasweb-kernel-boundary-scan.ts')) ? sibling : null
}

describe('kernel boundary gate runner (T6-A 波终门, 落仓形)', () => {
  test('runner script exists and is executable from repo root', () => {
    expect(existsSync(runnerPath)).toBe(true)
  })

  test('one-command repro: allowed=true, violations=0, evidence assembled', async () => {
    const scannerRoot = resolveScannerRoot()
    if (scannerRoot === null) {
      // 配对仓缺席不是扫描失败——如实 skip（gate 仍可由 env 覆写单跑）。
      console.log('skip: paired scanner root unavailable (set ATLASCODE_ROOT)')
      return
    }
    const proc = Bun.spawn(['bun', 'run', runnerPath], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...globalThis.process.env, ATLASCODE_ROOT: scannerRoot },
    })
    const output = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited

    expect(stderr).toBe('')
    expect(exitCode).toBe(0)
    const parsed = JSON.parse(output) as {
      allowed: boolean
      violationCount: number
      violations: unknown[]
      externalImports: string[]
      sourceRoots: string[]
      evidence: { declaredCount: number; vendorAliasCount: number }
    }
    expect(parsed.allowed).toBe(true)
    expect(parsed.violationCount).toBe(0)
    expect(parsed.violations).toEqual([])
    expect(parsed.sourceRoots.length).toBeGreaterThanOrEqual(15) // packages/*/src + apps/atlasweb/src
    expect(parsed.evidence.vendorAliasCount).toBe(9)
    expect(parsed.evidence.declaredCount).toBeGreaterThan(30)
    expect(parsed.externalImports.length).toBeGreaterThan(0)
  })

  test('fail-closed lock: absent scanner source → exit 2, no scan verdict emitted', async () => {
    const proc = Bun.spawn(['bun', 'run', runnerPath], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...globalThis.process.env, ATLASCODE_ROOT: '/nonexistent-atlascode-root' },
    })
    const output = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited
    expect(exitCode).toBe(2)
    expect(output).toBe('') // 无扫描结论产出——环境缺口不得伪装成绿
    expect(stderr).toContain('ATLASCODE_ROOT')
  })
})
