// T6-A 波终门：kernel 边界扫描收口 runner（落仓形——Atlas-reveiw 审计条件
// 2026-11-20：violation=0 须为第三方一条命令可复现面，不得依赖 ad hoc 装配）。
//
// 用法：bun scripts/verify-kernel-boundary.ts   （仓库根执行）
// 退出码：0 = allowed（violation=0）；1 = 违规/证据面缺口（fail-closed）；
//         2 = 环境面缺口（scanner 源不可达）。
//
// 闭包证据装配（单一事实源全部从本仓现读，不落临时文件）：
// ① 全仓 package.json（root + packages/* + apps/*）dependencies ∪ devDependencies；
// ② tsconfig.base.json paths 的 @deepseek-ai/* vendor 别名（bare 形在源码
//    出现，vite 不读 tsconfig paths、bun 由 tsconfig 解析——两种声明形态同证据）；
// ③ node: 内建 ×10（扫描源实际出现的内建面清单，逐项列举不自动扩——
//    新内建边出现时本 runner 如实报 undeclared，由人扩单）；
// ④ mdast 裸指明符 → @types/mdast 类型包映射（import type 编译期擦除，
//    bun/vite 双工具链零运行时边——dsh 同形）。
//
// scanner 单一事实源 = 配对仓 AtlasCode scripts/atlasweb-kernel-boundary-scan.ts
// （ATLASCODE_ROOT 覆写，默认兄弟仓 ../AtlasCode；不 vendored 不手拷——
// 拷贝即漂移面，扫描器语义演进归上游单点）。
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = new URL('..', import.meta.url).pathname.replace(/\/$/, '')

const scannerRelative = join('scripts', 'atlasweb-kernel-boundary-scan.ts')
const scannerRoot =
  process.env.ATLASCODE_ROOT ??
  (existsSync(join(repoRoot, '..', 'AtlasCode', scannerRelative))
    ? join(repoRoot, '..', 'AtlasCode')
    : null)
if (scannerRoot === null || !existsSync(join(scannerRoot, scannerRelative))) {
  console.error(
    'kernel boundary gate: scanner source unavailable — set ATLASCODE_ROOT to the AtlasCode checkout',
  )
  process.exit(2)
}

const { scanAtlasWebKernelBoundary } = await import(join(scannerRoot, scannerRelative))

// ① manifest 声明并集（dependencies ∪ devDependencies，全 workspace 面）。
const declared = new Set<string>()
const manifestPaths = [join(repoRoot, 'package.json')]
for (const dir of ['packages', 'apps']) {
  for (const entry of readdirSync(join(repoRoot, dir))) {
    manifestPaths.push(join(repoRoot, dir, entry, 'package.json'))
  }
}
for (const manifestPath of manifestPaths) {
  if (!existsSync(manifestPath)) continue
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  for (const name of Object.keys(manifest.dependencies ?? {})) declared.add(name)
  for (const name of Object.keys(manifest.devDependencies ?? {})) declared.add(name)
}

// ② tsconfig.base.json paths → vendor 别名（@deepseek-ai/* 形）。
const tsconfig = JSON.parse(readFileSync(join(repoRoot, 'tsconfig.base.json'), 'utf8')) as {
  compilerOptions?: { paths?: Record<string, string[]> }
}
const vendorAliases = Object.keys(tsconfig.compilerOptions?.paths ?? {}).filter(name =>
  name.startsWith('@deepseek-ai/'),
)
for (const alias of vendorAliases) declared.add(alias)

// ③ node: 内建实际面（逐项列举；新内建边如实报 undeclared 由人扩单）。
const nodeBuiltins = [
  'node:crypto',
  'node:fs',
  'node:path',
  'node:child_process',
  'node:http',
  'node:fs/promises',
  'node:module',
  'node:stream',
  'node:url',
  'node:util',
]
for (const builtin of nodeBuiltins) declared.add(builtin)

// ④ mdast 类型包映射（@types/mdast 已在 ① 内——bare 形补映射）。
declared.add('mdast')

// 扫描根：packages/*/src（存在者）+ apps/atlasweb/src。dist/ 产物面不入扫描
// （minified 假影面；产物红线由词表烟测腿覆盖）。
const sourceRoots: string[] = []
const packagesDir = join(repoRoot, 'packages')
for (const entry of readdirSync(packagesDir)) {
  if (existsSync(join(packagesDir, entry, 'src'))) sourceRoots.push(`packages/${entry}/src`)
}
if (existsSync(join(repoRoot, 'apps/atlasweb/src'))) sourceRoots.push('apps/atlasweb/src')

const result = scanAtlasWebKernelBoundary({
  repositoryRoot: repoRoot,
  sourceRoots,
  externalDependencies: [...declared].sort(),
})

console.log(
  JSON.stringify(
    {
      allowed: result.allowed,
      violationCount: result.violations.length,
      violations: result.violations,
      externalImports: result.externalImports,
      sourceRoots,
      evidence: {
        declaredCount: declared.size,
        vendorAliasCount: vendorAliases.length,
        nodeBuiltinCount: nodeBuiltins.length,
        typeMappings: ['mdast → @types/mdast'],
      },
    },
    null,
    2,
  ),
)
process.exit(result.allowed ? 0 : 1)
