# G1/G2 门真值表（格 J）

机器评估：`packages/web-host/src/gateTruthTable.ts` → `evaluateGates()`；
判据腿：`packages/web-host/test/gateTruthTable.test.ts`。全部行对当前仓
**真实事实**实测（pin / 配对档 / 测试腿文件 / git 干净度），零声明式常量。
G1 与 G2 输出分立——G2 未齐格时 `admitted=false` 且缺口必须带处置指向。

**本表快照 @ 2026-11-16（载体 0.1.121 / S0-R5，格 I 重出后）——G2 = admitted**

## G1 = implementationAdmitted → **true**

| 行 | 判据 | 状态 | 证据 |
|---|---|---|---|
| repo-created | 独立仓已建（web-host 载体在案） | ✅ | repo root + packages/web-host |
| carrier-exact-pin | 载体精确 pin（双面一致，禁 link/源拼接） | ✅ | `@atlasharness/atlascode` = 0.1.121 exact |
| pairing-records | 配对档在案、锚逐字验证 | ✅ | Pairing 1–5；0.1.121 锚 `874ad82a…329302076`（SRI = installed 两点恒等） |

## G2 = foundationReleasable → **true**（全格满足，格 I 收口 @`docs/gezi-i-pairing-rollback.md`）

| 行 | 判据 | 状态 | 证据 / 处置 |
|---|---|---|---|
| face-list-replay | 格 D list/replay 真 controller | ✅ | `httpHost.test.ts` GREEN |
| face-follow | 格 D+H follow 流（SSE+背压 fail-closed+强断+槽释放） | ✅ | `followStream`/`followPump` GREEN；安全审查三 Finding 全闭 @6d22e2c |
| face-search | 格 D searchSessions（S0-R4 @0.1.119） | ✅ | `searchFace.test.ts` GREEN（真实命中/query 界 fail-closed 400/scope 守卫/委派守卫） |
| recovery-race-legs | 格 E 恢复与竞态（S0-R3 三腿镜像） | ✅ | `s0r3-regression.test.ts` GREEN |
| lifecycle-isolation | 格 F 双实例隔离 | ✅ | `dualInstance.test.ts` GREEN @b1368eb |
| auth-fence | 格 G/H 授权围栏 | ✅ | `security.test.ts` + fence/auth 腿 GREEN |
| pairing-rollback-live | 格 I 配对/回滚实测 | ✅ | 重出 CLOSED（Pairing 5 载体 0.1.121，背书 @docs/attestations/gezi-i.json，reportCommit `c2ab9ab`）：clean clone `3fc97a0` → 降级 0.1.119 锚 `f4b1e4d0` 恒等（预期面 6 fail 零无关回归）→ 回升 0.1.121 锚 `874ad82a` 幂等 → 终态 host 43/0 + e2e 54/0 → 配对档 append-only 完整 |
| clean-candidate | 干净候选 checkout | ✅/动态 | `git status --porcelain` 空（评估器实测；有残留即翻 gap） |
| truth-table-self | 格 J 真值表机器评估 | ✅ | 本评估器（自指行） |

## 登记（非阻塞，不触 G2）

- ~~S0-R5（0.1.121 候，@2ef06607）~~ **已采纳**（2026-11-16，Pairing 5）：② resetRequired 重采样兜底 + ③ resumeCursor 零重放续接全落地；消费腿 ③/③b/⑥-A GREEN + flush-headers host 修形；E2E-06b/⑥-A e2e 侧翻转 GREEN（54/0）。
- E2E-07 传输强断观测腿 skip（登记债）：候服务端背压确定性 seam（launchCli SO_SNDBUF 收小 或 等价）翻转回 active。

## 宣告链

G2 = admitted（2026-11-16）→ 本表 + 格 I 报告 → Atlas-reveiw 审计 → 宣告。
复评命令：`bun test packages/web-host/test/gateTruthTable.test.ts`（真值表随仓事实动态；快照仅为人读面）。

复评命令：`bun test packages/web-host/test/gateTruthTable.test.ts`
（真值表随仓事实动态；快照仅为人读面，判定以评估器输出为准。）
