/**
 * A0 runner：候选 tgz 安装/启动缝 + 会话 fixture 工厂。
 *
 * 接口（工单 A0，A1–A5 同名沿用）：
 * - `requireCandidateTgz()`：ATLASWEB_TGZ 预检——绝对路径、存在、
 *   文件名属 @atlaswork scope（`atlaswork-atlasweb-<ver>.tgz`）。违规
 *   即 process.exit(1)（fail-closed 非零退出）。
 * - `installTgz(path)`：独立临时安装目录 + 临时 HOME + 空 npm 缓存，
 *   `npm install --offline --ignore-scripts --no-audit --no-fund <tgz>`。
 *   返回 { installDir, manifest }。
 * - `createSessionRoot(dir)`：在测试创建的目录内生成短样本（4 条）、
 *   长样本（360 条，唯一 uuid m001…m360、可变高正文、m180 唯一关键字）、
 *   另一会话与空库 scope。
 * - `launchSourceHostReproduction({ sessionsDir, staticDir })`：受控复现
 *   程序——源码宿主 launchCli.ts 服已安装包的 dist/（仅 0.1.3 对照腿用；
 *   候选腿禁止走此回退）。就绪 JSON 恰一行从 stdout 消费；打开链接
 *   （/auth/redeem?token=…）只在内存构造返回，不写控制台/trace/报告。
 *
 * 令牌与宿主真实目录路径不出本模块边界（测试报告只见 baseUrl 与制品锚）。
 */
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'

export interface InstalledManifest {
  name: string
  version: string
  bin?: Record<string, string>
  files?: string[]
}

export interface InstalledApp {
  installDir: string
  manifest: InstalledManifest
  artifactSha256: string
}

export interface SourceHostHandle {
  baseUrl: string
  /** 打开链接（单次兑换）；只在内存传递，禁入日志/报告。 */
  redeemUrl: string
  sessionsDir: string
  close(): void
}

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '')

/** 候选 tgz 预检：缺失/相对路径/错 scope 一律 exit 1（runner fail-closed）。 */
export function requireCandidateTgz(): string {
  const tgz = process.env.ATLASWEB_TGZ
  if (!tgz || !tgz.startsWith('/')) {
    process.stderr.write('fatal: ATLASWEB_TGZ must be an absolute path to the candidate tgz\n')
    process.exit(1)
  }
  if (!existsSync(tgz)) {
    process.stderr.write(`fatal: ATLASWEB_TGZ not found: (path withheld)\n`)
    process.exit(1)
  }
  // scope 门：仅 @atlaswork 面产物（bun pm pack 形 tarball 名）。
  if (!/^atlaswork-atlasweb-\d+\.\d+\.\d+(?:-.*)?\.tgz$/.test(basename(tgz))) {
    process.stderr.write('fatal: ATLASWEB_TGZ is not an @atlaswork scope artifact (unexpected filename)\n')
    process.exit(1)
  }
  return tgz
}

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), 'atlasweb-e2e-'))
}

/** 测试侧临时根（会话 fixture 目录等）。 */
export function mkdtempSafe(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

/** 尽力清理临时安装根（installTgz 返回值的父目录）。 */
export function cleanupInstalled(app: InstalledApp): void {
  try { rmSync(join(app.installDir, '..'), { recursive: true, force: true }) } catch { /* best effort */ }
}

/** 离线安装候选 tgz：临时 HOME + 空 npm 缓存，PATH 不做任何假设注入。 */
export function installTgz(tgzPath: string): InstalledApp {
  const root = tempRoot()
  const installDir = join(root, 'install')
  const homeDir = join(root, 'home')
  const cacheDir = join(root, 'npm-cache')
  mkdirSync(installDir, { recursive: true })
  mkdirSync(homeDir, { recursive: true })
  mkdirSync(cacheDir, { recursive: true })
  const artifactSha256 = createHash('sha256').update(readFileSync(tgzPath)).digest('hex')
  const res = spawnSync('npm', [
    'install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund',
    tgzPath,
  ], {
    cwd: installDir,
    env: {
      ...process.env,
      HOME: homeDir,
      npm_config_cache: cacheDir,
      npm_config_update_notifier: 'false',
    },
    encoding: 'utf8',
  })
  if (res.status !== 0) {
    process.stderr.write(`fatal: npm install failed (exit ${res.status}):\n${res.stderr}\n`)
    process.exit(1)
  }
  const manifestPath = join(installDir, 'node_modules', '@atlaswork', 'atlasweb', 'package.json')
  if (!existsSync(manifestPath)) {
    process.stderr.write('fatal: installed package manifest missing (@atlaswork/atlasweb)\n')
    process.exit(1)
  }
  return {
    installDir,
    manifest: JSON.parse(readFileSync(manifestPath, 'utf8')) as InstalledManifest,
    artifactSha256,
  }
}

export interface FixtureMessageSpec {
  uuid: string
  role: 'user' | 'assistant'
  text: string
}

/** 单条 AtlasCode 会话 JSONL 行（user/assistant 文本轮 + parentUuid 链）。 */
function sessionLine(entry: Record<string, unknown>): string {
  return `${JSON.stringify(entry)}\n`
}

export function makeMessage(spec: FixtureMessageSpec, parentUuid: string | null, sessionId: string, ts: string): string {
  return sessionLine({
    type: spec.role,
    uuid: spec.uuid,
    parentUuid,
    sessionId,
    timestamp: ts,
    message: { role: spec.role, content: [{ type: 'text', text: spec.text }] },
  })
}

/**
 * 会话 fixture 工厂：只在调用方创建的目录内写文件。
 *
 * - 短样本 short-0001：恰 4 条消息（m001–m004）。
 * - 长样本 long-0360：360 条（m001–m360），可变高正文（含围栏代码块），
 *   m180 含唯一关键字 QUAHOG-MID-NEEDLE（搜索命中锚）。
 * - 另一会话 other-0001：2 条。
 * - 空库 scope：独立目录，零 jsonl。
 */
export function createSessionRoot(baseDir: string): { mainDir: string; emptyDir: string } {
  const mainDir = join(baseDir, 'main')
  const emptyDir = join(baseDir, 'empty')
  mkdirSync(mainDir, { recursive: true })
  mkdirSync(emptyDir, { recursive: true })

  const write = (sessionId: string, lines: string[]): void => {
    writeFileSync(join(mainDir, `${sessionId}.jsonl`), lines.join(''), 'utf8')
  }
  const baseTs = '2026-11-20T10:00:00.000Z'
  const stamp = (i: number): string => {
    const d = new Date(Date.parse(baseTs) + i * 60_000)
    return d.toISOString()
  }

  // 短样本：4 条。
  const shortLines: string[] = [
    sessionLine({ type: 'custom-title', sessionId: 'short-0001', customTitle: 'Short sample session' }),
  ]
  let parent: string | null = null
  for (let i = 1; i <= 4; i++) {
    const uuid = `m${String(i).padStart(3, '0')}`
    const role = i % 2 === 1 ? 'user' : 'assistant'
    shortLines.push(makeMessage({ uuid, role, text: `Short sample message ${uuid}: fixed four-message opening.` }, parent, 'short-0001', stamp(i)))
    parent = uuid
  }
  write('short-0001', shortLines)

  // 长样本：360 条，可变高。
  const longLines: string[] = [
    sessionLine({ type: 'custom-title', sessionId: 'long-0360', customTitle: 'Long sample session' }),
  ]
  parent = null
  for (let i = 1; i <= 360; i++) {
    const uuid = `m${String(i).padStart(3, '0')}`
    const role = i % 2 === 1 ? 'user' : 'assistant'
    let text: string
    if (uuid === 'm180') {
      text = 'Search needle QUAHOG-MID-NEEDLE: the unique mid-session marker.'
    } else if (uuid === 'm360') {
      text = 'Tail marker m360: final message; a reachable reader shows this.'
    } else {
      // 可变高（轻剖面）：短行为主 + 少量小代码块。真实行高贴近估高
      // 28px 剖面——与 reaudit 复现剖面一致（长段落剖面会使 scrollTop/28
      // 过冲被 clamp 直达尾部，掩盖固定估高的可达性缺口）。
      const line = `Message ${uuid}: one short line of body text.`
      const code = i % 9 === 0 ? `\n\n\`\`\`ts\nconst c${i} = ${i}\n\`\`\`` : ''
      text = line + code
    }
    longLines.push(makeMessage({ uuid, role, text }, parent, 'long-0360', stamp(i)))
    parent = uuid
  }
  write('long-0360', longLines)

  // 另一会话：2 条。
  const otherLines: string[] = [
    sessionLine({ type: 'custom-title', sessionId: 'other-0001', customTitle: 'Other session' }),
  ]
  parent = null
  for (let i = 1; i <= 2; i++) {
    const uuid = `m${String(i).padStart(3, '0')}`
    otherLines.push(makeMessage({ uuid, role: i % 2 === 1 ? 'user' : 'assistant', text: `Other session message ${uuid}.` }, parent, 'other-0001', stamp(i)))
    parent = uuid
  }
  write('other-0001', otherLines)

  return { mainDir, emptyDir }
}

/**
 * 受控复现程序（仅 0.1.3 对照腿）：源码宿主 + 已安装包 dist/。
 * 就绪协议 = stdout 恰一行 JSON {ready,port,token}。
 */
export async function launchSourceHostReproduction(opts: { sessionsDir: string; staticDir: string }): Promise<SourceHostHandle> {
  const root = tempRoot()
  const child = spawn('bun', [
    join(REPO_ROOT, 'packages', 'web-host', 'src', 'launchCli.ts'),
    '--port', '0',
    '--scope', `main=${opts.sessionsDir}`,
    '--static', opts.staticDir,
  ], {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const ready = await consumeReadyLine(child, 'source host')
  return {
    baseUrl: `http://127.0.0.1:${ready.port}`,
    redeemUrl: `http://127.0.0.1:${ready.port}/auth/redeem?token=${encodeURIComponent(ready.token)}`,
    sessionsDir: opts.sessionsDir,
    close(): void {
      child.kill('SIGTERM')
      // 优雅关闭序（launchCli 内建）；兜底强杀防残进程。
      const timer = setTimeout(() => child.kill('SIGKILL'), 5000)
      child.once('exit', () => clearTimeout(timer))
      rmSync(root, { recursive: true, force: true })
    },
  }
}

/** A1 候选腿：启动已安装包的 .bin/atlasweb（Node 运行，PATH 剥 bun 段）。 */
export interface InstalledBinHandle {
  baseUrl: string
  /** 打开链接（单次兑换）；只在内存传递，禁入日志/报告。 */
  redeemUrl: string
  token: string
  /** A4 断线腿：bin 进程号（SIGSTOP/SIGCONT 冻结/恢复服务面）。 */
  pid: number
  close(): void
}

/** 就绪协议消费（stdout 恰一行 JSON {ready,port,token}，30s 超时）。 */
function consumeReadyLine(child: ReturnType<typeof spawn>, label: string): Promise<{ ready: true; port: number; token: string }> {
  let stderrBuf = ''
  child.stderr?.on('data', (d: Buffer) => { stderrBuf += d.toString() })
  return new Promise((resolve, reject) => {
    let buf = ''
    const timer = setTimeout(() => reject(new Error(`${label} not ready in 30s; stderr: ${stderrBuf.slice(-2000)}`)), 30_000)
    child.stdout?.on('data', (d: Buffer) => {
      buf += d.toString()
      const nl = buf.indexOf('\n')
      if (nl >= 0) {
        clearTimeout(timer)
        try {
          resolve(JSON.parse(buf.slice(0, nl)))
        } catch (error) {
          reject(error)
        }
      }
    })
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`${label} exited early (${code}); stderr: ${stderrBuf.slice(-2000)}`)) })
  })
}

/**
 * A1 候选腿启动器：直接运行安装包 `.bin/atlasweb`（Node shebang 直跑）。
 * 环境硬约束：PATH 剥除一切含 bun 的段（bin 必须在 Node 下可运行，
 * 启动 PATH 不含 Bun——plan A1 判据原文）；静态根不传（npmEntry 固定包内
 * dist/，即被测行为本体）。
 */
export async function launchInstalledBin(app: InstalledApp, sessionsDir: string): Promise<InstalledBinHandle> {
  const binPath = join(app.installDir, 'node_modules', '.bin', 'atlasweb')
  if (!existsSync(binPath)) {
    process.stderr.write('fatal: installed package has no .bin/atlasweb (A1+ self-contained package shape required)\n')
    process.exit(1)
  }
  // node 自身目录必须留在 PATH（playwright runner 即 node；bin shebang env node）。
  const nodeDir = dirname(process.execPath)
  const bunlessPath = [nodeDir, ...(process.env.PATH ?? '')
    .split(':')
    .filter(seg => seg.length > 0 && !seg.includes('bun'))].join(':')
  const child = spawn(binPath, ['--port', '0', '--scope', `main=${sessionsDir}`], {
    cwd: app.installDir,
    env: { ...process.env, PATH: bunlessPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const ready = await consumeReadyLine(child, 'installed bin')
  return {
    baseUrl: `http://127.0.0.1:${ready.port}`,
    redeemUrl: `http://127.0.0.1:${ready.port}/auth/redeem?token=${encodeURIComponent(ready.token)}`,
    token: ready.token,
    pid: child.pid ?? -1,
    close(): void {
      child.kill('SIGTERM')
      const timer = setTimeout(() => child.kill('SIGKILL'), 5000)
      child.once('exit', () => clearTimeout(timer))
    },
  }
}

// —— B 附表 §2/§3 执行腿启动器（B1/B2 e2e pw 腿；R3/R4 裁定）——

/** 执行腿宿主句柄：InstalledBinHandle + 统一目录锚（断言用）。 */
export interface ExecutionHostHandle extends InstalledBinHandle {
  workspaceId: string
  /** 引擎 cwd（授权工作区；磁盘证据断言面）。 */
  workspaceDir: string
  /** host scope 目录 ≡ 引擎落盘 project 目录（R4 统一目录；会话 JSONL 落盘断言面）。 */
  scopeDir: string
  /** 隔离 ATLAS_CONFIG_DIR（引擎 file-history/plans 等副产物隔离面）。 */
  cfgDir: string
}

/**
 * 执行腿启动器：已安装 bin + --execution + 引擎统一目录。
 *
 * - 引擎真体：spawn 按名 `atlas`（生产形）——PATH 前置仓内
 *   `node_modules/.bin`（R3：@atlaswork/atlascode 精确 pin；全局 atlas 版本
 *   陈旧禁用）。安装包零 npm dependencies（自包含 bundle），引擎由运行环境
 *   PATH 供给。
 * - 统一目录（R4，实测定谳 probe 2026-11-25）：host --scope 目录 =
 *   `<cfg>/projects/<encoded-ws>`（引擎落盘 project 目录，cwd 斜杠→短横）；
 *   引擎 `--resume <sessionId>` 直接命中 fixture 预置会话并追加落盘 →
 *   只读投影面（刷新回读）可见。
 * - 引擎配置隔离：ATLAS_CONFIG_DIR = 临时 cfg（settings.json + .credentials.json
 *   自 ~/.atlas 拷贝——本机引擎可跑前提；缺席即腿红，非静默跳过）。
 * - fixture 预置：短样本 short-0001（4 条，makeMessage 形）。
 *
 * 令牌与目录路径不出本模块边界。
 */
export async function launchInstalledBinExecution(app: InstalledApp, opts?: {
  workspaceId?: string
  actorId?: string
}): Promise<ExecutionHostHandle> {
  const workspaceId = opts?.workspaceId ?? 'ws-exec'
  const actorId = opts?.actorId ?? 'atlasweb-e2e'
  const root = tempRoot()
  const workspaceDir = join(root, 'ws')
  const cfgDir = join(root, 'cfg')
  const scopeDir = join(cfgDir, 'projects', workspaceDir.replaceAll('/', '-'))
  mkdirSync(workspaceDir, { recursive: true })
  mkdirSync(scopeDir, { recursive: true })
  // 引擎配置（R4 探针定谳的最小集）：settings.json（模型角色/提供商）+
  // .credentials.json（凭据）。缺席 → 引擎快速失败 → 腿红（明示，非跳过）。
  for (const name of ['settings.json', '.credentials.json']) {
    const src = join(process.env.HOME ?? '', '.atlas', name)
    if (!existsSync(src)) {
      process.stderr.write(`fatal: ~/.atlas/${name} missing — engine config prerequisite for execution legs\n`)
      process.exit(1)
    }
    cpSync(src, join(cfgDir, name))
  }
  // fixture 预置会话（短样本 4 条 + custom-title；引擎 --resume 兼容形已实测）。
  const baseTs = '2026-11-20T10:00:00.000Z'
  const lines = [`${JSON.stringify({ type: 'custom-title', sessionId: 'short-0001', customTitle: 'Execution leg session' })}\n`]
  let parent: string | null = null
  for (let i = 1; i <= 4; i++) {
    const uuid = `m${String(i).padStart(3, '0')}`
    const role = i % 2 === 1 ? 'user' : 'assistant'
    lines.push(makeMessage({ uuid, role, text: `Execution leg message ${uuid}: seeded opening.` }, parent, 'short-0001', baseTs))
    parent = uuid
  }
  writeFileSync(join(scopeDir, 'short-0001.jsonl'), lines.join(''), 'utf8')

  const binPath = join(app.installDir, 'node_modules', '.bin', 'atlasweb')
  if (!existsSync(binPath)) {
    process.stderr.write('fatal: installed package has no .bin/atlasweb\n')
    process.exit(1)
  }
  const nodeDir = dirname(process.execPath)
  const pathSegs = (process.env.PATH ?? '').split(':').filter(seg => seg.length > 0 && !seg.includes('bun'))
  const execPath = [join(REPO_ROOT, 'node_modules', '.bin'), nodeDir, ...pathSegs].join(':')
  const child = spawn(binPath, [
    '--port', '0',
    '--scope', `main=${scopeDir}`,
    '--execution',
    '--workspace', `${workspaceId}=${workspaceDir}`,
    '--actor-id', actorId,
  ], {
    cwd: app.installDir,
    env: { ...process.env, PATH: execPath, ATLAS_CONFIG_DIR: cfgDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const ready = await consumeReadyLine(child, 'installed bin (execution)')
  return {
    baseUrl: `http://127.0.0.1:${ready.port}`,
    redeemUrl: `http://127.0.0.1:${ready.port}/auth/redeem?token=${encodeURIComponent(ready.token)}`,
    token: ready.token,
    pid: child.pid ?? -1,
    workspaceId,
    workspaceDir,
    scopeDir,
    cfgDir,
    close(): void {
      child.kill('SIGTERM')
      const timer = setTimeout(() => child.kill('SIGKILL'), 5000)
      child.once('exit', () => clearTimeout(timer))
      rmSync(root, { recursive: true, force: true })
    },
  }
}
