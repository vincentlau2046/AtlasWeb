# 第一波 A5 候选验收 verdict（F4，2026-11-21）

**裁定：A 段候选验收 PASS（条件满足形）。** 依据 = e2e 独立复核判定单 `AtlasCode user-e2e/reports/r-20261121-atlasweb-wave1-agate.md`（GATE-PASS）+ Main 收口回执 + 候选制品 staging `atlaswork-atlasweb-0.1.3.tgz` sha256 `1cef97f3…`（码面 @82945c7）。本 verdict 只验收 A 段只读候选；不是产品第一波总通过，不是发布授权。

## 全局特性列表

| 特性 | 判定 | 根因/实证 |
|---|---|---|
| 制品锚与镜像同源 | 满足 | 双组织 sha256+sha512 逐字对表；解包 diff 唯一差异 = package.json name 一行 |
| carrier 双 pin 溯源 | 满足 | manifest runtimeSha256 `7e7e6f38…` = npm 0.1.125 registry tarball 实取实算逐字 |
| 安装入口（A1） | 满足 | 干净离线安装 GREEN；bin.atlasweb=server/atlasweb.js；`dependencies` ABSENT |
| 长读/定位/窄窗/恢复（A2/A3/A4） | 满足 | 候选 13 腿×3 稳定绿（m001/m360 可达、m180 精确定位、drawer、断线恰一次）；A0 对照 3/3 对 registry 旧制品如实复现 |
| 全仓回归 | 满足 | 442 pass/1 skip/0 fail 两轮一致；kernel boundary 0 |
| F6-PAGE 缺接口格 | **未通过（挂账维持）** | 无内容分页公开接口；阻产品总放行，不阻本 gate |
| Node 20 最低边界腿 | **登记：未单跑** | 本机仅 node 24；engines >=20 兼容面成立但最低边界未验 |
| 发布版本面 | **登记** | npm 已有 0.1.3 发布；候选发布须新版本号（按版本契约默认只升 0.1.x），不得覆盖 0.1.3 |

## 处置与后果

1. **B1 落码双前提闭合**（B 附表审计闭环 7a63064 + 本 A5 PASS）：B 排波信号发 Main；B1 实际开工仍受上游执行出口波交付约束（upstream.ts 单接触点候 0.1.126 出口）。
2. **登记两条随总放行链走**：① Node 20 最低边界腿须在发布链或产品终验前补跑（容器/CI 形均可），未跑不给产品总通过；② 候选发布用新版本号，版本动作由 Main 按授权另走。
3. F6-PAGE 维持阻产品总放行；发布成功不补任何验收缺口。
