# G1/G2 门真值表（格 J）

机器评估：`packages/web-host/src/gateTruthTable.ts` → `evaluateGates()`；
判据腿：`packages/web-host/test/gateTruthTable.test.ts`。全部行对当前仓
**真实事实**实测（pin / 配对档 / 测试腿文件 / git 干净度），零声明式常量。
G1 与 G2 输出分立——G2 未齐格时 `admitted=false` 且缺口必须带处置指向。

**本表快照 @ 2026-11-16（载体 0.1.119 / S0-R4，main @734e5c3+）**

## G1 = implementationAdmitted → **true**

| 行 | 判据 | 状态 | 证据 |
|---|---|---|---|
| repo-created | 独立仓已建（web-host 载体在案） | ✅ | repo root + packages/web-host |
| carrier-exact-pin | 载体精确 pin（双面一致，禁 link/源拼接） | ✅ | `@atlasharness/atlascode` = 0.1.118 exact |
| pairing-records | 配对档在案、锚逐字验证 | ✅ | Pairing 1–3；0.1.118 锚 `133f279a…de8cb089` 三方恒等 |

## G2 = foundationReleasable → **false**（缺口 2，如实列示）

| 行 | 判据 | 状态 | 证据 / 处置 |
|---|---|---|---|
| face-list-replay | 格 D list/replay 真 controller | ✅ | `httpHost.test.ts` GREEN |
| face-follow | 格 D+H follow 流（SSE+背压 fail-closed+强断+槽释放） | ✅ | `followStream`/`followPump` GREEN；安全审查三 Finding 全闭 @6d22e2c |
| face-search | 格 D searchSessions（S0-R4 @0.1.119） | ✅ | `searchFace.test.ts` GREEN（真实命中/query 界 fail-closed 400/scope 守卫/委派守卫） |
| recovery-race-legs | 格 E 恢复与竞态（S0-R3 三腿镜像） | ✅ | `s0r3-regression.test.ts` GREEN |
| lifecycle-isolation | 格 F 双实例隔离 | ✅ | `dualInstance.test.ts` GREEN @b1368eb |
| auth-fence | 格 G/H 授权围栏 | ✅ | `security.test.ts` + fence/auth 腿 GREEN |
| **pairing-rollback-live** | 格 I 配对/回滚实测 | ❌ | 涉真实 npm 安装链，待用户授权（pending owner authorization） |
| clean-candidate | 干净候选 checkout | ✅/动态 | `git status --porcelain` 空（评估器实测；有残留即翻 gap） |
| truth-table-self | 格 J 真值表机器评估 | ✅ | 本评估器（自指行） |

## 通往 G2 的最短路径

1. ~~上游 S0-R4 落地 → 锚升级 + search 腿~~ **已完成**（0.1.119 采入，锚三点恒等：cli.js 18,215,220B / f4b1e4d0…f3bee8；Pairing 4 @pairing 留档）。
2. 用户授权格 I → 真实降级/升级链实测 → `pairing-rollback-live` 翻绿。
3. 该格齐 → `evaluateGates().g2.admitted = true` → G2 宣告链（gate→审计→生产 lane）。

复评命令：`bun test packages/web-host/test/gateTruthTable.test.ts`
（真值表随仓事实动态；快照仅为人读面，判定以评估器输出为准。）
