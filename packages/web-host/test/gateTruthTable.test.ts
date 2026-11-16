import { describe, expect, test } from 'bun:test'

// 格 J（S0 协定 §门分阶段）：G1/G2 真值表——机器对当前仓真实事实逐行
// 判定，G1 与 G2 输出不同；G2 未齐格时必须如实列缺口，杜绝误报实施就绪。
// 判定行（§6 A–J 映射）：
//   G1 = implementationAdmitted：建仓/开发授权事实 + 载体 pin + 配对档；
//        不要求 controller 证据。
//   G2 = foundationReleasable：四面真 controller（A-D）/恢复竞态（E）/
//        生命周期隔离（F）/授权围栏（G）/配对回滚实测（I）/真值表自指
//        （J）/干净候选 checkout——全格满足才 true。
import { evaluateGates } from '../src/gateTruthTable'

describe('格 J: G1/G2 gate truth table (machine-evaluated)', () => {
  const table = evaluateGates()

  test('G1 = admitted: repo + exact pin + pairing records, no controller evidence required', () => {
    expect(table.g1.admitted).toBe(true)
    const byId = Object.fromEntries(table.g1.rows.map(r => [r.id, r]))
    expect(byId['repo-created']!.state).toBe('satisfied')
    expect(byId['carrier-exact-pin']!.state).toBe('satisfied')
    expect(byId['pairing-records']!.state).toBe('satisfied')
    expect(table.g1.rows.every(r => r.state === 'satisfied')).toBe(true)
  })

  test('G2 = NOT admitted while hard-gate rows are open; gaps named explicitly', () => {
    expect(table.g2.admitted).toBe(false)
    const gapIds = table.g2.rows.filter(r => r.state === 'gap').map(r => r.id)
    // 当前实况缺口：search 面（上游 S0-R4 未落地）+ 格 I 配对/回滚实测
    expect(gapIds).toContain('face-search')
    expect(gapIds).toContain('pairing-rollback-live')
    // 已满足格必须为满足（机器实测事实，非声明）
    const byId = Object.fromEntries(table.g2.rows.map(r => [r.id, r]))
    expect(byId['face-list-replay']!.state).toBe('satisfied')
    expect(byId['face-follow']!.state).toBe('satisfied')
    expect(byId['lifecycle-isolation']!.state).toBe('satisfied')
    expect(byId['auth-fence']!.state).toBe('satisfied')
    expect(byId['recovery-race-legs']!.state).toBe('satisfied')
    expect(byId['truth-table-self']!.state).toBe('satisfied')
    // 缺口行必须带处置指向（上游波号/授权态），不得静默
    for (const gap of table.g2.rows.filter(r => r.state === 'gap')) {
      expect(gap.evidence).toMatch(/S0-R4|待授权|pending/)
    }
  })

  test('truth table is machine-verifiable against workspace facts (pin = 0.1.118)', () => {
    expect(table.carrierVersion).toBe('0.1.118')
    expect(table.evaluatedAt).toBeTruthy()
  })
})
