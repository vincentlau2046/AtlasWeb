import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

// @atlasharness/atlasweb 0.1.1 发布链判据腿（0.1.0 首发链判据形延续，
// 2026-11-20 换锚：浏览器 redeem 面修复随版）：
// 发布 staging script 生成可发布包——版本=收口契约（root package.json
// version 单一事实源，apps 版本断言同值防漂移）、测的=发布的（staging
// 从 dist 拷贝，dist 由 vite build 产出）、tarball SRI 面输出。脚本可
// 重复执行（幂等：staging 先清后建）。

const repoRoot = join(import.meta.dir, '..', '..', '..')
const scriptPath = join(repoRoot, 'scripts', 'build-npm-package.ts')
const stagingDir = join(repoRoot, 'build', 'npm-package')
const tarballPath = join(repoRoot, 'build', 'atlasharness-atlasweb-0.1.1.tgz')

describe('@atlasharness/atlasweb 0.1.1 publish staging', () => {
  test('staging script exists and version contract holds (root = apps = 0.1.1)', () => {
    expect(existsSync(scriptPath)).toBe(true)
    const root = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as { version: string }
    const app = JSON.parse(readFileSync(join(repoRoot, 'apps/atlasweb/package.json'), 'utf8')) as { version: string }
    expect(root.version).toBe('0.1.1')
    expect(app.version).toBe(root.version)
  })

  test('staged manifest: scoped name, private omitted, files = dist+README, no runtime deps', async () => {
    rmSync(stagingDir, { recursive: true, force: true })
    const proc = Bun.spawn(['bun', 'run', scriptPath], { cwd: repoRoot, stdout: 'pipe', stderr: 'pipe' })
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited
    // vite 构建告警走 stderr（chunk size 等）——断言零 error 面而非零输出。
    expect(stderr.toLowerCase()).not.toContain('error')
    expect(exitCode).toBe(0)

    const manifest = JSON.parse(readFileSync(join(stagingDir, 'package.json'), 'utf8')) as Record<string, unknown>
    expect(manifest.name).toBe('@atlasharness/atlasweb')
    expect(manifest.version).toBe('0.1.1')
    expect(manifest.private).toBeUndefined()
    expect(manifest.files).toEqual(['dist', 'README.md'])
    expect(manifest.license).toBe('MIT')
    expect(manifest.dependencies).toBeUndefined()
    expect(manifest.devDependencies).toBeUndefined()
    expect(existsSync(join(stagingDir, 'dist', 'index.html'))).toBe(true)
    expect(existsSync(join(stagingDir, 'README.md'))).toBe(true)
  })

  test('tarball packed with SRI surface (sha256/sha512 recorded)', async () => {
    expect(existsSync(tarballPath)).toBe(true)
    const integrity = JSON.parse(readFileSync(join(stagingDir, 'pack-integrity.json'), 'utf8')) as {
      tarball: string
      sha256: string
      sha512Base64: string
    }
    expect(integrity.tarball.endsWith('.tgz')).toBe(true)
    expect(integrity.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(integrity.sha512Base64).toMatch(/^sha512-[\w+/]+={0,2}$/)
  })

  test('release anchor: staged tarball bytes == 0.1.1 SRI anchor (NODE_ENV 泄漏面锁)', async () => {
    // 0.1.1 发布锚（docs/sri/v0.1.1.md）：脚本钉 NODE_ENV=production 后，
    // 本腿在 bun test 环境（ambient NODE_ENV=test）内产出的 tarball 必须
    // 与发布 tarball 字节恒等——泄漏形（mmlMhzHG / 08431d6c…）如实负锁。
    // 后续版本发布时随 docs/sri/vX.Y.Z.md 同步换锚。
    const integrity = JSON.parse(readFileSync(join(stagingDir, 'pack-integrity.json'), 'utf8')) as {
      sha256: string
    }
    expect(integrity.sha256).toBe('7fa811e3f78df05c7d654e415f423f191f7878fe2c136d543f114f288f7e3512')
  })

  test('--name form: second-org staging (@atlaswork/atlasweb) with own tarball+integrity', async () => {
    // 双组织发布（version-contract.md）：同版本同内容第二 scope。
    const proc = Bun.spawn(['bun', 'run', scriptPath, '--name', '@atlaswork/atlasweb'], {
      cwd: repoRoot, stdout: 'pipe', stderr: 'pipe',
    })
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited
    expect(stderr.toLowerCase()).not.toContain('error')
    expect(exitCode).toBe(0)
    const manifest = JSON.parse(
      readFileSync(join(repoRoot, 'build', 'npm-package-atlaswork', 'package.json'), 'utf8'),
    ) as Record<string, unknown>
    expect(manifest.name).toBe('@atlaswork/atlasweb')
    expect(manifest.version).toBe('0.1.1')
    const integrity = JSON.parse(
      readFileSync(join(repoRoot, 'build', 'npm-package-atlaswork', 'pack-integrity.json'), 'utf8'),
    ) as { tarball: string; sha256: string }
    expect(integrity.tarball).toBe('atlaswork-atlasweb-0.1.1.tgz')
    expect(integrity.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(existsSync(join(repoRoot, 'build', 'atlaswork-atlasweb-0.1.1.tgz'))).toBe(true)
  })
})
