# viewport 根修波工单——候选 pw 滚位 helper 根修 + 对照腿跑形固化（收尾工单 §7-11 必做销项）

> 出典：第一波放行终判格 1 显性豁免条款（收尾工单 §7-11 @dceadcb）——4 viewport 红 pre-existing 零引入放行，**根修波升格必做销项**；判词侧终判 @9d4e284 §2 同裁（升格「立项」+ 未收口前逐卷显性重登）。角色：本工单 = atlas-mainline-f4 起草（波前详细方案+审视环节）；落码归 Main；e2e 验收（×3 + D1）；审视判据/纪律面归 Atlasweb-F4；审计归 Atlas-reveiw。与 #277 UI 消费波不同域可并行。

## §0 活码重核（2026-11-27 @ AtlasWeb main dceadcb + e2e 判定单两卷 + gr1 日志实勘）

| 面 | 活码核真 |
|---|---|
| 红面签名 | 四红逐字同一：`toBeInViewport('[data-message-id="m180"]')` ratio 0 @ 10s×24 重试；**locator resolve 成功**（`data-index="179"` `data-role="assistant"` 在 DOM）→ 内容/数据面正常，纯视口滚位红 |
| 红腿集 | `first-wave-candidate.pw.ts`：腿 7 `append at mid-read`（:193 内联断言）+ 腿 9 `refresh restores`（:285→helper :235）+ 腿 10 `missing anchor`（:312→:235）+ 腿 11 `disconnect catches up`（:346→:235）；最后绿 = A-gate 候选 13×3 @82945c7（r-20261121），B1/B2 gate 未重跑候选 13 腿 → 潜伏首现 @W1+E1 轮 |
| **helper 缺口（主根因假说，活码直证）** | `readToMidAndSettle` :226-237——:187 注释「循环小步上滚**直到 m180 入视口**」而退出条件实为 `isVisible()`（:230）＝有 bounding box 即真；虚拟化（`@tanstack/react-virtual` :9/:132，`REPLAY_WINDOW_SIZE`+`REPLAY_OVERSCAN` 有界窗 :210）下 **overscan 缓冲行挂载即 isVisible=true 而可 ratio=0** → 循环提前退出、断言干等 10s。腿 7 内联副本 :188-192 同缺口。**注释≠实现背离 = test-side 缺口本体**；A-gate 时点几何巧合覆盖之（行高/视口高恰使 m180 挂载即入视口），几何一变即暴露 |
| 几何变更源（触发面，归因候 R1 探针） | 窗口 `82945c7..fbf03f8~1` web-code 5 提交全 B 系 UI chrome（3ade5f9 Composer/QueueList/ApprovalCard / e5656f7 执行通道挂载 / 186e7c3 / 01081e4 StatusStrip+DeliverablesCard+settingsPanel / 45b6d6d WorkspaceListPanel）；只读会话面新增 = StatusStrip + DeliverablesCard（walk10 直证只读卡面「工具活动： 0」在档）→ 纵向视口几何变化 plausible；1487b19（锚 offset 修复）merge-base 直证 A-gate 绿面祖先已洗 |
| 判词侧定性（约束本波） | 失效面 = 测试视口断言敏感面，非内容缺失/产品功能失效；产品面全绿互证（walk10/11 端到端）。**但**腿 9/10/11 所探测的产品面（刷新锚恢复/缺锚显性/断线恰一次）自 82945c7 起处于**覆盖暗窗**——helper 修通后首次真跑，红面须按证据另行裁定（§3） |

## §1 切片 1：R1 根因定谳探针（Main，落码前第一件）

- 一次性插桩跑（不入仓或随修形同 revert）：helper 循环逐轮 dump——`transcript.scrollTop` / `m180` boundingClientRect vs transcript viewport / virtualizer 窗口界（`getVirtualItems()` 首尾 index）/ StatusStrip·DeliverablesCard 实占高度。
- **判据**：探针输出须直证或证伪「overscan 行挂载即退出」机制 + 给出几何变更归因提交（五候选内逐件 diff 对表）。探针证据随修形 commit 附注登记。
- 产物 = 归因结论一行入修形 commit message（单提交归因补齐——W1+E1 §2a-3 登记的候定谳面就此销）。

## §2 切片 2：helper 根修（Main，test-side only）

- **修形**：循环退出条件改为**真入视口判定**（`m180` boundingClientRect 与 transcript 滚动容器视口相交 ≥1px，轮内自算）＋保留小步 wheel（-2000px/120ms）＋有界轮数（30 维持，不放大）；腿 7 内联副本同修；`readToMidAndSettle` 轮后 :236 settle 800ms 维持。
- **红线（防伪修）**：① 四腿产品面断言**逐字零改动**（toBeInViewport/toHaveCount/toHaveURL 等全数保留——机器可判：修形 diff 断言行零增删改）；② 禁改 ratio/timeout 放水；③ 禁改用 `scrollIntoViewIfNeeded`（改变受测滚动机理）；④ 锚 effect（ConversationView :166/:180/:207）零触碰除非 §3 探针实证产品缺陷。
- 单测腿：无（pw helper 无 unit 面；覆盖 = 四腿自身 ×3）。

## §3 切片 3：暗窗产品面首跑裁定（e2e，helper 修通后）

- 腿 9（刷新锚恢复）/腿 10（缺锚显性）/腿 11（断线恰一次）产品面自 82945c7 起暗窗，本切片 = 修通后首次真跑（×3）。
- **预注册裁定形**：绿 = A3/A4 覆盖恢复；红 = 按证据两分——① helper 残余机理（轮内再修）② 真产品缺陷（锚恢复/断线面）→ 产品修形切片入本波（Main）或独立裁定呈判词侧，**不冒绿不冒销**。

## §4 切片 4（并卷增量，自决采认）：readonly 对照腿跑形固化

- W1+E1 §2b 处置候选兑现：对照 3 腿（`[对照]` 0.1.3 三腿）恢复 A-gate 先例跑形 = **registry 旧制品 0.1.3 专跑分调用**（`npm view dist.integrity` 交叉核 + 冻结副本 D1），candidate/execution 调用排除 `[对照]`（grep 形沿用 b12 协议注记）；撤销「喂候选制品给对照腿」的跑形错配源。
- GREEN：对照 3/3 绿（旧制品专跑）+ 候选/执行两调用零影响。
- 归并理由：同文件族 test-infra 域 + 现 17/7 噪声面每轮污染全 Suite 判读；独立微波不成比例。判词侧审视可翻（翻则出波另立）。

## §5 审视记录（f4 逐点自决）

| # | 点 | 裁定 | 依据 |
|---|---|---|---|
| 1 | 修形落点 = test-side 先行 | 自决：helper 退出条件根修，产品码零预设触碰 | 判词侧定性 + 活码注释≠实现直证；产品面缺陷须证据（§3 预注册两分） |
| 2 | 对照腿固化并卷 | 自决：并卷为切片 4（判词侧可翻） | 同域微件 + 噪声消除即时收益；独立波不成比例 |
| 3 | 归因探针独立成切片 | 自决：R1 前置（systematic-debugging 纪律：根因先于修） | W1+E1 §2a-3 登记面兑现；修形 commit 附归因结论 |
| 4 | 与 #277 并行性 | 自决：可并行（e2e/pw test-infra 域 vs web-code 消费码域；唯一共享面 = 全仓 bun test canon 判读时点协调） | 双波落码域零交集；canon 计数面候双波合流轮对表 |
| 5 | GREEN 口径 | 自决：§6 全绿格；×3 稳定 + D1 冻结副本纪律照 §7-7③ 常设 | 判定轮程序纪律既采认形 |

## §6 判据格（预注册，全绿才收口）

1. 四前红腿 ×3 GREEN（腿 7/9/10/11）；
2. candidate 13 + execution 8 = 21/21 ×3 零回退；
3. 对照 3/3 绿（旧制品专跑形，切片 4）；
4. 全仓 `bun test` canon ≥546 pass / 0 fail（tests/ 纯面口径）+ typecheck 0；
5. **断言零改动审计**：修形 diff 断言行零增删改（机器可判）+ R1 归因结论在 commit 附注；
6. D1 冻结副本判前判后 sha MATCH（判定轮）。

## §7 信号面

工单（本档）→ Atlas-reveiw 审计 + Atlasweb-F4 审视（候件 1）→ 双 PASS 后双信号（Main 落码 §1-§2〔+§3 产品面如触发〕+§4 / e2e 验收 §3+§6）。收口后：收尾工单 §7-11 格 1 豁免条件兑现销项 + 逐卷重登义务终止。
