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
import { basename, join } from 'node:path'

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
  let stderrBuf = ''
  child.stderr?.on('data', (d: Buffer) => { stderrBuf += d.toString() })
  const readyJson = new Promise<{ ready: true; port: number; token: string }>((resolve, reject) => {
    let buf = ''
    const timer = setTimeout(() => reject(new Error(`source host not ready in 30s; stderr: ${stderrBuf.slice(-2000)}`)), 30_000)
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
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`source host exited early (${code}); stderr: ${stderrBuf.slice(-2000)}`)) })
  })
  const ready = await readyJson
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
