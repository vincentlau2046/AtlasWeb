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
