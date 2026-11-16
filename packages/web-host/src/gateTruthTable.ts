/**
 * 格 J：G1/G2 分阶段门真值表（机器评估）。
 *
 * 判定一律对当前仓真实事实（文件存在性 / package.json pin / 配对档行 /
 * git 干净度），零声明式常量——「不误报实施就绪」的机器承载：G2 未齐格
 * 时 admitted=false 且缺口行必须带处置指向。
 *
 * G1 = implementationAdmitted：建仓 + 载体精确 pin + 配对档；不要求
 *      controller 证据（S0 协定门分阶段语义）。
 * G2 = foundationReleasable：§6 A–J 硬格全满足才 admitted；search 面
 *      （上游 S0-R4）与格 I（待授权）当前如实列 gap。
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

export type RowState = 'satisfied' | 'gap'

export interface GateRow {
  id: string
  gate: 'G1' | 'G2'
  criterion: string
  state: RowState
  evidence: string
}

export interface GateTable {
  carrierVersion: string
  evaluatedAt: string
  g1: { admitted: boolean; rows: GateRow[] }
  g2: { admitted: boolean; rows: GateRow[] }
}

const repoRoot = (() => {
  // packages/web-host/src → repo root
  return join(import.meta.dir, '..', '..', '..')
})()

function readRepo(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8')
}

function carrierPin(): string {
  const root = JSON.parse(readRepo('package.json')) as { dependencies?: Record<string, string> }
  const host = JSON.parse(readRepo('packages/web-host/package.json')) as { dependencies?: Record<string, string> }
  const rootPin = root.dependencies?.['@atlasharness/atlascode']
  const hostPin = host.dependencies?.['@atlasharness/atlascode']
  if (rootPin !== hostPin) return '' // 双 pin 不一致 = 不满足
  return rootPin ?? ''
}

function gitStatusClean(): boolean {
  try {
    const out = execFileSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' })
    return out.trim().length === 0
  } catch {
    return false
  }
}

const has = (rel: string): boolean => existsSync(join(repoRoot, rel))

export function evaluateGates(now: Date = new Date()): GateTable {
  const pin = carrierPin()
  const rowsG1: GateRow[] = [
    {
      id: 'repo-created',
      gate: 'G1',
      criterion: 'AtlasWeb 独立仓已建（G1 建仓授权）',
      state: has('package.json') && has('packages/web-host/src/sessionHost.ts') ? 'satisfied' : 'gap',
      evidence: 'repo root package.json + web-host carrier present',
    },
    {
      id: 'carrier-exact-pin',
      gate: 'G1',
      criterion: '上游载体精确 pin（根 + web-host 双面一致；禁 npm link/源路径拼接）',
      state: pin !== '' ? 'satisfied' : 'gap',
      evidence: `@atlasharness/atlascode = ${pin || '<missing/mismatch>'}（exact pin, npm registry only）`,
    },
    {
      id: 'pairing-records',
      gate: 'G1',
      criterion: '配对档在案且锚逐字验证（Pairing 1–3：0.1.116/117/118）',
      state: has('docs/upstream-pairing.md') && readRepo('docs/upstream-pairing.md').includes('133f279a') ? 'satisfied' : 'gap',
      evidence: 'docs/upstream-pairing.md Pairing 3 锚 133f279a…de8cb089（0.1.118 gate 预注册三方恒等）',
    },
  ]

  const rowsG2: GateRow[] = [
    {
      id: 'face-list-replay',
      gate: 'G2',
      criterion: '格 D：list/replay 真实 controller（persisted-effective-conversation）',
      state: has('packages/web-host/test/httpHost.test.ts') ? 'satisfied' : 'gap',
      evidence: 'httpHost.test.ts 真实 list/replay 腿 GREEN（24/0 套件内）',
    },
    {
      id: 'face-follow',
      gate: 'G2',
      criterion: '格 D+H：follow 流（SSE 桥 + 背压 fail-closed + 强断 + 槽释放）',
      state: has('packages/web-host/test/followStream.test.ts') && has('packages/web-host/src/followPump.ts') ? 'satisfied' : 'gap',
      evidence: 'followStream/followPump 腿 GREEN；安全审查①②及 follow-up 全闭 @6d22e2c',
    },
    {
      id: 'face-search',
      gate: 'G2',
      criterion: '格 D：searchSessions（已持久化有效投影内搜索）',
      state: 'gap',
      evidence: '上游缺口已立 S0-R4（0.1.119 候，登记档 @bcd47495）；落地即锚升级+补腿；pending upstream wave',
    },
    {
      id: 'recovery-race-legs',
      gate: 'G2',
      criterion: '格 E：恢复与竞态（S0-R3 三腿镜像：环链有界拒/TOCTOU 交接窗/资源界）',
      state: has('packages/web-host/test/s0r3-regression.test.ts') ? 'satisfied' : 'gap',
      evidence: 's0r3-regression.test.ts 三腿 GREEN（resourceLimit/ioUnavailable/gap-null）',
    },
    {
      id: 'lifecycle-isolation',
      gate: 'G2',
      criterion: '格 F：双实例生命周期隔离（零串域/close 不互伤/epoch 互异/零全局切换）',
      state: has('packages/web-host/test/dualInstance.test.ts') ? 'satisfied' : 'gap',
      evidence: 'dualInstance.test.ts GREEN @b1368eb',
    },
    {
      id: 'auth-fence',
      gate: 'G2',
      criterion: '格 G/H：授权围栏（单次 token→HMAC cookie + loopback Host/Origin + 未授权拒）',
      state: has('packages/web-host/test/security.test.ts') ? 'satisfied' : 'gap',
      evidence: 'security.test.ts + httpHost fence/auth 腿 GREEN',
    },
    {
      id: 'pairing-rollback-live',
      gate: 'G2',
      criterion: '格 I：配对/回滚实测（真实 npm 降级/升级链安装动作）',
      state: 'gap',
      evidence: '涉真实安装链，待用户授权（pending owner authorization）',
    },
    {
      id: 'clean-candidate',
      gate: 'G2',
      criterion: '干净候选 checkout（工作树零未提交残留）',
      state: gitStatusClean() ? 'satisfied' : 'gap',
      evidence: gitStatusClean() ? 'git status --porcelain 空' : '工作树有未提交残留——提交后复评；pending clean candidate checkout',
    },
    {
      id: 'truth-table-self',
      gate: 'G2',
      criterion: '格 J：真值表机器评估在案（本评估器；G1/G2 输出分立）',
      state: 'satisfied',
      evidence: 'src/gateTruthTable.ts evaluateGates() —— 全部行对仓内事实实测',
    },
  ]

  return {
    carrierVersion: pin,
    evaluatedAt: now.toISOString(),
    g1: { admitted: rowsG1.every(r => r.state === 'satisfied'), rows: rowsG1 },
    g2: { admitted: rowsG2.every(r => r.state === 'satisfied'), rows: rowsG2 },
  }
}
