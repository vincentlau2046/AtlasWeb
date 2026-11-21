import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

// @atlasharness/atlasweb 发布 staging 判据腿（0.1.1 判据形延续；A1 改形
// 2026-11-20：自包含包形——bin.atlasweb=server/atlasweb.js（Node ESM
// bundle，载体 web-session-runtime 构建时打进 bundle），dist/ 只放浏览器
// 产物，发布 manifest 零 npm runtime dependencies，atlaswebCarrier 仅作
// 溯源（实际载体版本 + 实际输入的 runtime JS 字节 SHA256）。
// 版本=收口契约：version 单一事实源 = root package.json；测的=发布的。

const repoRoot = join(import.meta.dir, '..', '..', '..')
const scriptPath = join(repoRoot, 'scripts', 'build-npm-package.ts')
const stagingDir = join(repoRoot, 'build', 'npm-package')
const tarballPath = join(repoRoot, 'build', 'atlasharness-atlasweb-0.1.3.tgz')

/** 载体双 pin 对表源：host manifest 的 exact pin。 */
const hostPin = (JSON.parse(readFileSync(join(repoRoot, 'packages/web-host/package.json'), 'utf8')) as { dependencies: Record<string, string> }).dependencies['@atlaswork/atlascode']!

/** 实际构建输入的载体 runtime JS（exports 解析面 = bundle 实际打进的面）。 */
const carrierRuntimePath = join(repoRoot, 'node_modules', '@atlaswork', 'atlascode', 'dist', 'web-session-runtime', 'index.js')

describe('@atlasharness/atlasweb 0.1.3 publish staging (A1 self-contained)', () => {
  test('staging script exists and version contract holds (root = apps = 0.1.3)', () => {
    expect(existsSync(scriptPath)).toBe(true)
    const root = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as { version: string }
    const app = JSON.parse(readFileSync(join(repoRoot, 'apps/atlasweb/package.json'), 'utf8')) as { version: string }
    expect(root.version).toBe('0.1.3')
    expect(app.version).toBe(root.version)
  })

  test('staged manifest: scoped name, bin entry, files = dist+server+README, no runtime deps, carrier provenance', async () => {
    rmSync(stagingDir, { recursive: true, force: true })
    const proc = Bun.spawn(['bun', 'run', scriptPath], { cwd: repoRoot, stdout: 'pipe', stderr: 'pipe' })
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited
    // vite/bun 构建告警走 stderr（chunk size 等）——断言零 error 面而非零输出。
    expect(stderr.toLowerCase()).not.toContain('error')
    expect(exitCode).toBe(0)

    const manifest = JSON.parse(readFileSync(join(stagingDir, 'package.json'), 'utf8')) as Record<string, unknown>
    expect(manifest.name).toBe('@atlasharness/atlasweb')
    expect(manifest.version).toBe('0.1.3')
    expect(manifest.private).toBeUndefined()
    expect(manifest.files).toEqual(['dist', 'server', 'README.md'])
    expect(manifest.license).toBe('MIT')
    // A1：一条启动命令——bin 固定 server/atlasweb.js（Node shebang bundle）。
    expect(manifest.bin).toEqual({ atlasweb: 'server/atlasweb.js' })
    expect(manifest.dependencies).toBeUndefined()
    expect(manifest.devDependencies).toBeUndefined()
    // 溯源面（仅 provenance，非运行时依赖）：实际载体版本 + 实际输入 runtime 字节 SHA256。
    const carrier = manifest.atlaswebCarrier as { version: string; runtimeSha256: string }
    expect(carrier.version).toBe(hostPin)
    expect(carrier.runtimeSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(existsSync(join(stagingDir, 'dist', 'index.html'))).toBe(true)
    expect(existsSync(join(stagingDir, 'README.md'))).toBe(true)
  })

  test('packed carrier provenance matches build input (runtimeSha256 = 实际载体 JS 字节)', () => {
    const manifest = JSON.parse(readFileSync(join(stagingDir, 'package.json'), 'utf8')) as {
      atlaswebCarrier: { version: string; runtimeSha256: string }
    }
    // 载体版本对表：node_modules 实装 manifest 版本 = staging 溯源版本 = host pin。
    const installed = JSON.parse(readFileSync(join(repoRoot, 'node_modules', '@atlaswork', 'atlascode', 'package.json'), 'utf8')) as { version: string }
    expect(installed.version).toBe(manifest.atlaswebCarrier.version)
    expect(manifest.atlaswebCarrier.version).toBe(hostPin)
    // runtimeSha256 = 构建实际读取（打进 bundle）的载体 runtime JS 字节 SHA256。
    expect(manifest.atlaswebCarrier.runtimeSha256).toBe(
      createHash('sha256').update(readFileSync(carrierRuntimePath)).digest('hex'),
    )
  })

  test('staged server bundle: node shebang, executable, self-contained ESM', () => {
    const serverPath = join(stagingDir, 'server', 'atlasweb.js')
    expect(existsSync(serverPath)).toBe(true)
    const bytes = readFileSync(serverPath, 'utf8')
    expect(bytes.startsWith('#!/usr/bin/env node')).toBe(true)
    // 可执行位（npm pack 保留 mode → .bin shim 直跑）。
    expect(statSync(serverPath).mode & 0o111).not.toBe(0)
    // 自包含：零裸 import（非 node: 内建 / 非 bundle 内部模块）。
    const bareImports = [...bytes.matchAll(/^import\s+['"]([^'".][^'"]*)['"]/gm)].map(m => m[1]!)
    expect(bareImports, `bare imports must be node: builtins only, got ${JSON.stringify(bareImports)}`)
      .toEqual([])
    // dist/ 只放浏览器产物：server/ 不得出现在 dist 下。
    expect(existsSync(join(stagingDir, 'dist', 'server'))).toBe(false)
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

  test('--name form: second-org staging (@atlaswork/atlasweb) with own tarball+integrity, same carrier provenance', async () => {
    // 双组织发布（version-contract.md）：同版本同内容第二 scope；
    // A1：镜像与主面同载体溯源同值（同 staging 产物派生）。
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
    expect(manifest.version).toBe('0.1.3')
    expect(manifest.bin).toEqual({ atlasweb: 'server/atlasweb.js' })
    const carrier = manifest.atlaswebCarrier as { version: string; runtimeSha256: string }
    const mainManifest = JSON.parse(readFileSync(join(stagingDir, 'package.json'), 'utf8')) as {
      atlaswebCarrier: { version: string; runtimeSha256: string }
    }
    expect(carrier.version).toBe(mainManifest.atlaswebCarrier.version)
    expect(carrier.runtimeSha256).toBe(mainManifest.atlaswebCarrier.runtimeSha256)
    const integrity = JSON.parse(
      readFileSync(join(repoRoot, 'build', 'npm-package-atlaswork', 'pack-integrity.json'), 'utf8'),
    ) as { tarball: string; sha256: string }
    expect(integrity.tarball).toBe('atlaswork-atlasweb-0.1.3.tgz')
    expect(integrity.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(existsSync(join(repoRoot, 'build', 'atlaswork-atlasweb-0.1.3.tgz'))).toBe(true)
  })

  test('bad scope fails closed on the staged server bundle (non-zero exit, no ready line)', async () => {
    // 缺 --scope → parseArgs throw → 非零退出；stdout 零就绪行（无 listener）。
    const serverPath = join(stagingDir, 'server', 'atlasweb.js')
    const proc = Bun.spawn(['node', serverPath, '--port', '0'], {
      cwd: repoRoot, stdout: 'pipe', stderr: 'pipe',
    })
    const stdout = await new Response(proc.stdout).text()
    const code = await proc.exited
    expect(code).not.toBe(0)
    expect(stdout).not.toContain('"ready"')
  })

  test('A4-final: --static is rejected on the installed package entry (static root is fixed, fail-closed)', async () => {
    // 安装包入口拒绝 --static：静态根固定包内 dist/（A1 契约）。静态层在
    // cookie 鉴权之前服文件——用户指定根即可让未鉴权 HTTP 面服出任意本地
    // 目录（reviewer Fix 7）。拒绝 = 非零退出 + 零就绪行 + stderr 指引。
    const serverPath = join(stagingDir, 'server', 'atlasweb.js')
    const proc = Bun.spawn(['node', serverPath, '--port', '0', '--static', '/tmp'], {
      cwd: repoRoot, stdout: 'pipe', stderr: 'pipe',
    })
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    const code = await proc.exited
    expect(code).not.toBe(0)
    expect(stdout).not.toContain('"ready"')
    expect(stderr).toContain('--static')
  })
})
