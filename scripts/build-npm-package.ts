// @atlasharness/atlasweb 发布 staging（首发链，2026-11-20 用户批发布）。
//
// 用法：bun scripts/build-npm-package.ts   （仓库根执行）
//
// 版本=收口契约：version 单一事实源 = root package.json；apps/atlasweb
// 版本断言同值（漂移即 fail-closed）。发布 manifest 由本脚本生成（源
// workspace manifest 保持 private + 内部名 @atlasweb/app，不动 bun.lock）；
// dist 由 vite build 现构建（测的=发布的：打包面 = 全套件验证过的构建链
// 产物，非陈旧 dist）；tarball 经 `bun pm pack`（npm 兼容形）+ SRI 面
// （sha256 hex + sha512 base64 = npm dist.integrity 同形）落 pack-integrity.json。
// 幂等：staging 先清后建。
import { createHash } from 'node:crypto'
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const appDir = join(repoRoot, 'apps', 'atlasweb')
const buildDir = join(repoRoot, 'build')

// --name 可选（双组织发布，version-contract.md）：默认 @atlasharness/atlasweb；
// 第二组织 @atlaswork/atlasweb。staging 目录按 scope 分离，tarball 名随包名。
const args = process.argv.slice(2)
let publishName = '@atlasharness/atlasweb'
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--name') {
    publishName = args[++i] ?? ''
  } else {
    console.error(`unknown argument: ${args[i]}`)
    process.exit(2)
  }
}
if (!/^@[a-z0-9-]+\/[a-z0-9-]+$/.test(publishName)) {
  console.error(`invalid --name: ${publishName}`)
  process.exit(2)
}
const scopeSuffix = publishName.split('/')[0].slice(1)
const stagingDir = scopeSuffix === 'atlasharness' ? join(buildDir, 'npm-package') : join(buildDir, `npm-package-${scopeSuffix}`)

const rootManifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
  name: string
  version: string
  description: string
  license: string
  engines?: { node?: string }
}
const appManifest = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8')) as { version: string }
if (appManifest.version !== rootManifest.version) {
  console.error(
    `version contract drift: root ${rootManifest.version} != apps/atlasweb ${appManifest.version}`,
  )
  process.exit(1)
}
const version = rootManifest.version

// dist 现构建（测的=发布的）。NODE_ENV 钉 production：ambient NODE_ENV
// （如 bun test 进程的 test 值）会经 vite define 泄进 bundle——0.1.0 实测
// 定谳（test 泄漏形 mmlMhzHG ≠ production 形 DROYFZrs），不钉则 caller
// 环境改写发布字节。
const build = Bun.spawnSync(['bun', 'run', '--cwd', 'apps/atlasweb', 'build'], {
  cwd: repoRoot,
  stdout: 'inherit',
  stderr: 'inherit',
  env: { ...process.env, NODE_ENV: 'production' },
})
if (build.exitCode !== 0) {
  console.error('vite build failed')
  process.exit(1)
}
if (!existsSync(join(appDir, 'dist', 'index.html'))) {
  console.error('dist/index.html missing after build')
  process.exit(1)
}

// staging 先清后建（幂等）。
rmSync(stagingDir, { recursive: true, force: true })
mkdirSync(stagingDir, { recursive: true })

// -- A1 自包含 server bundle（一条启动命令）--
// npmEntry + web-host + 构建时精确锁定的 @atlaswork/atlascode/
// web-session-runtime 一起打成单文件 Node ESM bundle（非 node: 内建依赖
// 全部内联；发布 manifest 零 npm runtime dependencies）。NODE_ENV 钉
// production（同 vite 面：ambient NODE_ENV 不得改写发布字节）。
const carrierRuntimeFile = Bun.resolveSync('@atlaswork/atlascode/web-session-runtime', join(repoRoot, 'packages', 'web-host'))
const carrierManifest = JSON.parse(
  readFileSync(join(repoRoot, 'node_modules', '@atlaswork', 'atlascode', 'package.json'), 'utf8'),
) as { version: string }
const runtimeSha256 = createHash('sha256').update(readFileSync(carrierRuntimeFile)).digest('hex')

const serverDir = join(stagingDir, 'server')
mkdirSync(serverDir, { recursive: true })
const serverPath = join(serverDir, 'atlasweb.js')
const bundle = Bun.spawnSync(
  [
    'bun', 'build', join(repoRoot, 'packages', 'web-host', 'src', 'npmEntry.ts'),
    '--target=node', '--format=esm', `--outfile=${serverPath}`,
  ],
  {
    cwd: repoRoot,
    stdout: 'inherit',
    stderr: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
  },
)
if (bundle.exitCode !== 0 || !existsSync(serverPath)) {
  console.error('server bundle build failed')
  process.exit(1)
}
// Node shebang + 可执行位（npm pack 保留 mode → .bin shim 直跑）。
const bundleBody = readFileSync(serverPath, 'utf8')
if (!bundleBody.startsWith('#!')) {
  writeFileSync(serverPath, `#!/usr/bin/env node\n${bundleBody}`)
}
chmodSync(serverPath, 0o755)

const publishedManifest = {
  name: publishName,
  version,
  description: rootManifest.description,
  license: rootManifest.license,
  type: 'module',
  engines: rootManifest.engines ?? { node: '>=20' },
  bin: { atlasweb: 'server/atlasweb.js' },
  files: ['dist', 'server', 'README.md'],
  atlaswebCarrier: { version: carrierManifest.version, runtimeSha256 },
  repository: {
    type: 'git',
    url: 'git+https://github.com/vincentlau2046/AtlasWeb.git',
  },
}
writeFileSync(join(stagingDir, 'package.json'), `${JSON.stringify(publishedManifest, null, 2)}\n`)

cpSync(join(appDir, 'dist'), join(stagingDir, 'dist'), { recursive: true })
cpSync(join(appDir, 'README.md'), join(stagingDir, 'README.md'))

// pack（bun pm pack 产 npm 兼容 tgz，落点 = staging cwd，后移 build/ 收敛）。
const pack = Bun.spawnSync(['bun', 'pm', 'pack'], {
  cwd: stagingDir,
  stdout: 'pipe',
  stderr: 'inherit',
})
if (pack.exitCode !== 0) {
  console.error('bun pm pack failed')
  process.exit(1)
}
// tarball 名 = npm pack 命名形（scope 去前缀）：atlasharness-atlasweb-<v>.tgz。
const packed = `${publishName.replace('@', '').replace('/', '-')}-${version}.tgz`
const stagedTarball = join(stagingDir, packed)
const tarball = join(buildDir, packed)
if (!existsSync(stagedTarball)) {
  console.error(`expected tarball missing: ${stagedTarball}`)
  process.exit(1)
}
rmSync(tarball, { force: true })
Bun.spawnSync(['mv', stagedTarball, tarball])
if (!existsSync(tarball)) {
  console.error(`expected tarball missing: ${tarball}`)
  process.exit(1)
}

// SRI 面：sha256 hex（文件面）+ sha512 base64（npm dist.integrity 同形）。
const bytes = readFileSync(tarball)
const sha256 = createHash('sha256').update(bytes).digest('hex')
const sha512Base64 = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
writeFileSync(
  join(stagingDir, 'pack-integrity.json'),
  `${JSON.stringify({ tarball: packed.trim(), sha256, sha512Base64, version, name: publishName }, null, 2)}\n`,
)

console.log(JSON.stringify({ tarball: packed.trim(), sha256, sha512Base64, version, name: publishName }))
