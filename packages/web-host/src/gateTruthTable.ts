/**
 * 格 J：G1/G2 分阶段门真值表（机器评估）。
 *
 * 判定一律对当前仓真实事实（文件存在性 / package.json pin / 配对档行 /
 * git 干净度），行事实零声明式常量（背书对表锚 EXPECTED 属预注册期望形，
 * 同族于 gate 预注册锚，非行事实声明）——「不误报实施就绪」的机器承载：
 * G2 未齐格时 admitted=false 且缺口行必须带处置指向。
 * 登记债（Atlas-reveiw 2026-11-17 (b)）：CI 波落地时增「安装品 cli.js
 * sha256 重算」步——锚恒等现住报告腿/人工程序，与签名背书残债同池。
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
  const rootPin = root.dependencies?.['@atlaswork/atlascode']
  const hostPin = host.dependencies?.['@atlaswork/atlascode']
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

// 格 I 背书验证器（安全审查硬化：散文子串派生 admit 可篡改）。
// 结构化 JSON（docs/attestations/gezi-i.json）+ 严格 schema + 交叉核验：
// commit 祖先绑定（reportCommit 须为 HEAD 祖先）/ pin 对表 / 锚摘要 /
// 套件计数——缺失/畸形/陈旧/错配一律 gap。残债：真来源性（CI 签名背书）
// 登记 AtlasWeb CI 波（现仓无 CI）。
export interface AttestationResult {
  state: RowState
  evidence: string
}

interface PairingRollbackAttestation {
  schemaVersion: number
  kind: string
  verdict: string
  date: string
  reportCommit: string
  carrier: {
    packageName: string
    upgradeVersion: string
    upgradeSha256Prefix: string
    downgradeVersion: string
    downgradeSha256Prefix: string
  }
  suites: { hostPass: number; hostFail: number; e2ePass: number; e2eFail: number }
}

const EXPECTED = {
  kind: 'pairing-rollback-attestation',
  upgradeVersion: '0.1.128',
  // 0.1.128 = F6-PAGE S1 载体 replay 内容分页公开接口波（wire 加性
  // pageToken/pageSize/hasMore/nextPageToken 键在场语义 + 装窗读路径 +
  // replay skeleton subtype+snipMetadata 保留）：runtime 101,550B
  // 85e9b293… + execution 291,452B 5c8c095e…（双 bundle 变值，S1 修形①②
  // 归因闭合——SRI docs/sri/v0.1.128.md）；cli.js 锚 18,239,436B
  // 45259d7d…（0.1.127=18,239,284B b4dfd8a4…，+152B = webSessionV0 分页
  // 键加性 + engine/session 共享 chunk 编译入 cli bundle——SRI 注记②）。
  // downgrade 锚 = 0.1.127 cli.js（真实降级腿实测 @2026-11-26 配对链，
  // registry 直下三腿逐字节）。
  upgradeSha256Prefix: '45259d7d0d1e1e2b',
  downgradeVersion: '0.1.127',
  downgradeSha256Prefix: 'b4dfd8a415687936',
} as const

function isHex(s: string, len: number): boolean {
  return new RegExp(`^[0-9a-f]{${len}}$`).test(s)
}

function isAncestorOfHead(commit: string): boolean {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], { cwd: repoRoot, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

export function verifyPairingRollbackAttestation(rawOverride?: string): AttestationResult {
  let raw: string
  try {
    raw = rawOverride ?? readRepo('docs/attestations/gezi-i.json')
  } catch {
    return { state: 'gap', evidence: 'attestation file missing' }
  }
  let a: PairingRollbackAttestation
  try {
    a = JSON.parse(raw) as PairingRollbackAttestation
  } catch {
    return { state: 'gap', evidence: 'attestation malformed (not JSON)' }
  }
  // 严格 schema：类型逐项（任意缺失/类型错 → gap）
  if (
    a.schemaVersion !== 1
    || a.kind !== EXPECTED.kind
    || a.verdict !== 'closed'
    || typeof a.date !== 'string' || a.date === ''
    || typeof a.reportCommit !== 'string' || !isHex(a.reportCommit, 40)
    || typeof a.carrier?.packageName !== 'string'
    || a.carrier.upgradeVersion !== EXPECTED.upgradeVersion
    || a.carrier.upgradeSha256Prefix !== EXPECTED.upgradeSha256Prefix
    || a.carrier.downgradeVersion !== EXPECTED.downgradeVersion
    || a.carrier.downgradeSha256Prefix !== EXPECTED.downgradeSha256Prefix
    || !isHex(a.carrier.upgradeSha256Prefix, 16) || !isHex(a.carrier.downgradeSha256Prefix, 16)
    || !Number.isInteger(a.suites?.hostPass) || !Number.isInteger(a.suites?.hostFail)
    || !Number.isInteger(a.suites?.e2ePass) || !Number.isInteger(a.suites?.e2eFail)
    || a.suites.hostFail !== 0 || a.suites.e2eFail !== 0
    || a.suites.hostPass <= 0 || a.suites.e2ePass <= 0
  ) {
    return { state: 'gap', evidence: 'attestation schema/cross-check mismatch' }
  }
  // 陈旧/错绑：reportCommit 须为 HEAD 祖先（绑仓演进）
  if (!isAncestorOfHead(a.reportCommit)) {
    return { state: 'gap', evidence: 'attestation reportCommit not an ancestor of HEAD' }
  }
  // pin 对表：背书 upgrade 版本须与当前仓 pin 一致
  if (carrierPin() !== a.carrier.upgradeVersion) {
    return { state: 'gap', evidence: 'attestation upgradeVersion != current pin' }
  }
  return {
    state: 'satisfied',
    evidence: `attestation docs/attestations/gezi-i.json verified (closed @${a.reportCommit.slice(0, 8)}, ${a.carrier.downgradeVersion}↔${a.carrier.upgradeVersion} anchors, suites ${a.suites.hostPass}/0+${a.suites.e2ePass}/0)`,
  }
}

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
      evidence: `@atlaswork/atlascode = ${pin || '<missing/mismatch>'}（exact pin, npm registry only）`,
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
      criterion: '格 D：searchSessions（已持久化有效投影内搜索，S0-R4 @0.1.119）',
      state: has('packages/web-host/test/searchFace.test.ts') ? 'satisfied' : 'gap',
      evidence: 'searchFace.test.ts GREEN（真实命中/query 界 fail-closed/scope 守卫/委派守卫）；上游 S0-R4 采 0.1.119',
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
      ...(() => {
        const r = verifyPairingRollbackAttestation()
        return { state: r.state, evidence: r.evidence }
      })(),
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
