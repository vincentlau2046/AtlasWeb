# 格 I：配对/回滚实测报告（真实 npm 安装链）

**VERDICT: CLOSED**（2026-11-16，用户全面授权执行）

判定单：真实 npm registry 安装链四腿全绿；G2 末格收口，
`evaluateGates().g2.admitted = true`（见 `packages/web-host/src/gateTruthTable.ts`）。

## 环境与纪律

- 执行域：`$CLAUDE_JOB_DIR/tmp/gezi-i/candidate`（fresh `git clone` 自本仓 main
  @`afa3641`——干净候选 checkout，零工作树残留，`git status --porcelain` 空）。
- 安装纪律：一律 `npm install --registry https://registry.npmjs.org`；零 npm
  link、零源路径拼接（S0 协定消费纪律全称遵守）。

## 腿 ① 干净候选 checkout

| 项 | 结果 |
|---|---|
| fresh clone HEAD | `afa3641`（main tip） |
| install | npm registry 精确 pin 解析成功 |
| 载体锚 | `cli.js` 18,215,220B / sha256 `f4b1e4d0…`（= SRI = gate 预注册 = 主仓安装品，四点恒等） |
| host 套件 | 38 pass / 0 fail |
| e2e 套件 | 52 pass / 0 fail |

## 腿 ② 降级 0.1.118（回滚形态）

| 项 | 结果 |
|---|---|
| 双面 pin → 0.1.118 | npm install 成功 |
| 载体锚 | `cli.js` 18,214,475B / sha256 `133f279a…`（= Pairing 3 预注册锚，字节恒等） |
| 核心套件 | 33 pass / 5 fail——5 fail **全部精确落在预期面**：3× search 腿（S0-R4 于 0.1.118 无实现）+ 1× 真值表 pin 断言（本腿 pin=0.1.118）+ 1× envelope search 部分；**零无关回归** |
| 判读 | 回滚可用性成立：前代配对版本可安装、可运行、锚可验；新代能力随版本缺席如实显形（非静默伪绿） |

## 腿 ③ 回升 0.1.119（升级形态）

| 项 | 结果 |
|---|---|
| 双面 pin → 0.1.119 | npm install 成功 |
| 载体锚 | `cli.js` 18,215,220B / sha256 `f4b1e4d0…`（与腿①同帧恒等） |
| host 套件 | 38 pass / 0 fail |
| e2e 套件 | 52 pass / 0 fail（全仓 90/0） |
| 判读 | 升级链幂等：降→升后状态与腿①全等 |

## 腿 ④ 配对档 append-only 完整性

`docs/upstream-pairing.md`：Pairing 1→2→3→3 addendum→4 依序在案，
5 行不可变记录完整；每行锚值与本报告实测锚互证（Pairing 3 ↔ 133f279a、
Pairing 4 ↔ f4b1e4d0）。

## 结论

- 格 I 四腿 CLOSED；S0 协定「可复现跨仓版本切面」实条款兑现。
- G2 硬格（§6 A–J）全满足；真值表 `pairing-rollback-live` 翻绿，
  `g2.admitted = true`。
- G2 宣告链启动：本报告 + 真值表 → Atlas-reveiw 审计 → 宣告。

---

# 格 I 重出（Pairing 5 载体，2026-11-16）

**VERDICT: CLOSED**（legs re-run；e2e 计数候 e2e lane E2E-06b/⑥-A 翻转确认后终发）

判定单：pin 0.1.119 → 0.1.121（S0-R5）变更触发旧背书对表翻 gap（真值表
纪律按设计生效），格 I 四腿对 Pairing 5 载体重跑。

## 腿 ① 干净候选 checkout（@`3fc97a0`）

| 项 | 结果 |
|---|---|
| fresh clone HEAD | `3fc97a0`（main tip，`git status --porcelain` 空） |
| install | npm registry 精确 pin 0.1.121 解析成功 |
| 载体锚 | `cli.js` 18,218,608B / sha256 `874ad82a…329302076`（= SRI = installed 两点恒等） |
| host 套件 | 41 pass / 2 fail——2 fail **全部为背书自指行**（attestation 仍锚 0.1.119， issuance 后即闭），零无关回归 |

## 腿 ② 降级 0.1.119（回滚形态）

| 项 | 结果 |
|---|---|
| 双面 pin → 0.1.119 | npm install 成功 |
| 载体锚 | `cli.js` 18,215,220B / sha256 `f4b1e4d0…f3bee8`（= Pairing 4 锚恒等） |
| host 套件 | 37 pass / 6 fail——6 fail **全部精确落在预期面**：③/③b/⑥-A 三腿（S0-R5 语义于 0.1.119 缺席，RED 形即登记面）+ 真值表 pin 断言 + 背书行 ×2；**零无关回归** |
| 判读 | 回滚可用性成立：前代配对版本可安装可运行锚可验；新代能力随版本缺席如实显形 |

## 腿 ③ 回升 0.1.121（升级形态）

| 项 | 结果 |
|---|---|
| 双面 pin → 0.1.121 | npm install 成功 |
| 载体锚 | `cli.js` 18,218,608B / sha256 `874ad82a…`（与腿①同帧恒等） |
| host 套件 | 41 pass / 2 fail（同腿①背书自指行） |
| 判读 | 升级链幂等：降→升后状态与腿①全等 |

## 腿 ④ 配对档 append-only 完整性

`docs/upstream-pairing.md`：Pairing 1→2→3→3 addendum→4→S0-R5 登记→5
依序在案；Pairing 5 锚（874ad82a / 3747eb5e / 7fd3f95c）与本报告腿①③实测互证。

## 本波新增判据资产

- ③/③b/⑥-A 消费腿（TDD：0.1.119 全 RED → 0.1.121 全 GREEN）
- flush-headers 判据腿（host 缺陷修形：零重放 resume 首事件前 SSE 头须冲刷）

## 终发（同日）

e2e lane 翻转确认到达（E2E-06b GREEN：合法 cursor 零重放续接 + 头即时冲刷
覆盖；未知 cursor 显式 resetRequired fail-arm。⑥-A GREEN：resetRequired
reason 形 "transcript rewritten (resample prefix mismatch)"，corruptData 全程
缺席）：**e2ePass 54 / e2eFail 0**（含 1 条 skip 腿 E2E-07 传输强断观测——
seam 依赖，登记候）。

背书终发：`docs/attestations/gezi-i.json` upgradeVersion 0.1.121 /
downgradeVersion 0.1.119 / reportCommit `c2ab9ab` / suites host 43/0 +
e2e 54/0（host 43 = 本 commit 后终态全绿套件，含背书自指行闭）。
登记债：E2E-07 seam（launchCli SO_SNDBUF 收小 或 等价服务端背压确定性 seam）
候下波翻转回 active。

---

# 格 I 轻量重出（Pairing 6 载体 0.1.122 docs-only，2026-11-17）

**VERDICT: CLOSED**（host 腿闭合；e2e 计数候 lane 确认——载体产物与 0.1.121 字节级恒等，面集零变）

| 腿 | 结果 |
|---|---|
| ① 干净候选 @`0bb5e10` | install 0.1.122 成功；cli.js 锚 `874ad82a…` 恒等；host 41/2（2 fail = 背书自指行，issuance 后闭） |
| ② 降级 0.1.121 | install 成功；cli.js 锚 `874ad82a…` **同值**（docs-only 双版本恒等实证）；host 40/3（3 fail = pin 断言 + 背书行 ×2，预期面零无关回归） |
| ③ 回升 0.1.122 | 锚同帧恒等；host 41/2（同腿①）幂等 |
| ④ append-only | Pairing 6 依序在案 |

判读注记：docs-only 波下降级/升级锚同值——「版本位移、产物零位移」；
rollback 可用性由版本面 pin 解析承载，行为面两版全等。

## 终发（2026-11-17）

e2e lane 复跑确认：**e2ePass 54 / e2eFail 0 / 1 skip**（与上轮全等，两轮稳定；
全仓 2 fail = 等终发的背书自指行预期中间态）。背书终发：
`docs/attestations/gezi-i.json` upgrade 0.1.122 / downgrade 0.1.121 /
锚前缀双面同值 `874ad82a`（docs-only 产物零位移）/ reportCommit `5316ffe` /
suites host 43/0 + e2e 54/0（host 43 = 本 commit 后终态全绿）。

---

# 格 I 重出（Pairing 7 载体 0.1.123 产品码波，2026-11-17）

**VERDICT: CLOSED**（host 腿闭合；e2e 计数候 lane 复跑确认）

| 腿 | 结果 |
|---|---|
| ① 干净候选 @`6d9b50d` | install 0.1.123 成功；cli.js 锚 `a960bb5f…`（= SRI）；host 41/2（2 fail = 背书自指行，issuance 后闭） |
| ② 降级 0.1.122 | install 成功；cli.js 锚 `874ad82a…`（= Pairing 6 锚恒等）；host 40/3（3 fail = pin 断言 + 背书行 ×2，预期面零无关回归） |
| ③ 回升 0.1.123 | 锚同帧恒等；host 41/2 幂等 |
| ④ append-only | Pairing 7 依序在案 |

消费面判读：runtime bundle/web-contract 字节级未变——回滚/回升在消费域行为全等，
cli.js 差异（roles 修）不在四读面触及范围。

## 终发（2026-11-17）

e2e lane 复跑确认：**e2ePass 54 / e2eFail 0 / 1 skip**（两轮稳定，S0-R5 standing；
2 fail = 等终发预期中间态）。背书终发：upgrade 0.1.123 锚 `a960bb5f` /
downgrade 0.1.122 锚 `874ad82a` / reportCommit `b278d2d` / suites host 43/0 +
e2e 54/0。

---

# 格 I 重出（Pairing 8 载体 0.1.124 产品码波，2026-11-18）

**VERDICT: CLOSED**（host 腿闭合；e2e 计数候 lane 复跑确认）

| 腿 | 结果 |
|---|---|
| ① 干净候选 @`cafd876` | install 0.1.124 成功；cli.js 锚 `4f75289b…`（= SRI 三点链第二例）；host 41/2（2 fail = 背书自指行） |
| ② 降级 0.1.123 | 锚 `a960bb5f…`（= Pairing 7 锚恒等）；host 40/3（预期面零无关回归） |
| ③ 回升 0.1.124 | 锚同帧恒等幂等；host 41/2 |
| ④ append-only | Pairing 8 依序在案 |

消费面判读：runtime/web-contract 字节级未变（theme 常量域不触四读面）——
回滚/回升在消费域行为全等。

## 终发（2026-11-18）

e2e lane 复跑确认：**e2ePass 54 / e2eFail 0 / 1 skip**（两轮稳定；2 fail =
等终发预期中间态）。背书终发：upgrade 0.1.124 锚 `4f75289b` /
downgrade 0.1.123 锚 `a960bb5f` / reportCommit `07a130d` / suites host 43/0 +
e2e 54/0。

# 格 I 重出（Pairing 9 载体 0.1.125 G-D 根修波，2026-11-20）

**VERDICT: CLOSED**（host 腿闭合；e2e 55 跑 1 skip 0 fail）

波因：W-UI-V 视觉闭环波 G-D（载体 list 面 title/messageCount 零提取根修，
AtlasWeb 依赖 0.1.124→0.1.125 随升；用户裁定「载体根修 0.1.125」）。
**消费面本波有位移**：web-session-runtime 出口 85,213B→88,845B
（`7e7e6f38…`）——G-D 提取码面进 runtime；cli.js 与 0.1.124 **逐字节恒等
（Δ=0，`4f75289b…`）**（改面全在 web 域，CLI 入口不引）。

| 腿 | 结果 |
|---|---|
| ① 干净候选 @`530f649` | install 0.1.125 成功；runtime 锚 `7e7e6f38…` + cli.js 锚 `4f75289b…` 双验；host 57/2 + e2e 54/0/1skip（2 fail = 背书自指行，json 未换版预期中间态） |
| ② 降级 0.1.124 | runtime 锚 `3747eb5e…`（= Pairing 8 帧恒等）+ cli.js 锚 `4f75289b…`（Δ=0 跨版本恒等）；host 56/3（3 fail = pin/背书自指行预期面；能力缺席如实显形——list 面 title 恒 null 即 0.1.124 行为） |
| ③ 回升 0.1.125 | 锚同帧恒等幂等（`7e7e6f38…`/`4f75289b…`）；host 57/2（自指行同帧） |
| ④ append-only | Pairing 9 依序在案 |

背书终发：upgrade 0.1.125 锚 `4f75289b` / downgrade 0.1.124 锚 `4f75289b`
（Δ=0 波对，双锚同帧为事实形态）/ reportCommit `530f649` /
suites host 59/0 + e2e 54/0（attestation json 终版复跑确认）。
