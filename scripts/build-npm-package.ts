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
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const appDir = join(repoRoot, 'apps', 'atlasweb')
const buildDir = join(repoRoot, 'build')
const stagingDir = join(buildDir, 'npm-package')

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

// dist 现构建（测的=发布的）。
const build = Bun.spawnSync(['bun', 'run', '--cwd', 'apps/atlasweb', 'build'], {
  cwd: repoRoot,
  stdout: 'inherit',
  stderr: 'inherit',
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

const publishName = '@atlasharness/atlasweb'
const publishedManifest = {
  name: publishName,
  version,
  description: rootManifest.description,
  license: rootManifest.license,
  type: 'module',
  engines: rootManifest.engines ?? { node: '>=20' },
  files: ['dist', 'README.md'],
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
