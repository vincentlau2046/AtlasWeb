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
- **R1 三行直证（审计必改 1 折入，与 §8 注记 1 互补）**：① **循环退出侧别**（m180 挂载时处容器上带/下带）② **步长 residue**（scrollTop mod 2000 vs 容器高 H / overscan 像素）③ **overscan 实测像素**（REPLAY_OVERSCAN=10 × 实测行高）——把「相位跳窗」假说直证/证伪；另记**退出方式**（条件退出 vs 30 轮耗尽，§8 注记 1）+ **transcript 容器 rect vs window viewportSize 对表**（两谓词不一致面直证化，审计建议 2①；断言零改动禁不变）。
- 产物 = 归因结论一行入修形 commit message（单提交归因补齐——W1+E1 §2a-3 登记的候定谳面就此销）。

## §2 切片 2：helper 根修（Main，test-side only）

- **修形（审计必改 1 修形——二选一，Main 实现自选）**：单判据替换**不构成收敛保证**（overscan 挂载带 y∈[-640,-h] 处下一步 -2000px 必越至 y≈[1360,2000] 下缘外；成功窗宽 ≈(H+h)/2000 ≈30-40%，B 系 chrome 改 H 后相位落 skip 带即 ×3 确定性红——**只换判据可能把旧确定性红换新确定性红**）。两形：**① mounted 后按 bbox 双向校正**（m180 处容器底之下 → 反向 wheel 回补 gap；处上 → 继续上滚）直至容器相交；**② 粗→匀两相**（unmounted 时 -2000px 粗滚；mounted 后收尾小步 ≤400px 消除跳窗，轮数预算 30 内分配）。两形共同：退出判据 = 真入视口判定（`m180` boundingClientRect 与 transcript 滚动容器相交 ≥1px，轮内自算）；腿 7 内联副本同修；`readToMidAndSettle` 轮后 :236 settle 800ms 维持；**循环退出谓词 = 容器相交（滚动机制正确参照），最终门 = 断言 toBeInViewport 零改动（§8 注记 4：两谓词非同一，不一致时断言如实红、§3 两分兜底，禁为对齐断言改断言）**。
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
2. **全目录 22/22 ×3 零回退**（`bunx playwright test --grep-invert '\[对照\]'` 实数 = candidate 13 + execution 8 + B3 自腿 deliverables 1 = 22，b12 防跑漏形全目录口径——审计必改 2a 采认）；
3. 对照 3/3 绿（旧制品专跑形，切片 4）；
4. 全仓 `bun test` canon ≥546 pass / 0 fail（tests/ 纯面口径）+ ~~`bunx tsc --noEmit -p tsconfig.json` = 0~~（**tsc 格撤除——§10 裁定，审计必改 2b 预授权条款「非 0 则撤除该格或登记基线差」之撤除支行使**；基线差登记见 §10）；
5. **断言零改动 + 参数钉审计**：修形 diff 断言行零增删改（机器可判）+ **修形参数面逐项钉**（粗相 -2000px/120ms、轮数上限 30、settle 800ms、禁 scrollIntoViewIfNeeded、timeout/ratio 零改动；两相形落地则匀相参数同钉——审计建议 2② 采认）+ R1 归因结论在 commit 附注；
6. D1 冻结副本判前判后 sha MATCH（判定轮）+ **锚预注册 = a4063946…7309b / 57027aa3…dae8b**（本波 test-side-only 零打包面 → 判前重建核验应与终验锚字节恒等；**显性触发条件 = 若 #277 UI 波或任何 web-code 落码在判定前合并 → 打包面变 → 按锚预注册纪律重出锚再判**〔§7-7 勘正先例同形，禁旧锚混判〕；§3 分支②产品修形触发同此——审计必改 3 采认）。**【触发已兑现 + f4 锚行勘正 2026-11-27】**：#277 web-code 落码 020f3cb 已合并 → 重出条款即时生效 → **Superseding 锚 #2 = ab8af94a…032be（atlaswork 282,486B）/ 5c685cfe…1b5b9（atlasharness 282,490B）**（SRI 节 @5eca531；vs a4063946 逐文件 diff 仅 client bundle 一文件；f4 独立实勘：build/ 双 sha 逐字 MATCH + SRI 锚 #2 节在档 + origin/main = 5eca531 ALIGNED）。**本波判定锚 = 锚 #2**，原预注册锚归档语义保留；后继 web-code 合并再触发则顺延重出，禁旧锚混判不变。

## §7 信号面

工单（本档）→ Atlas-reveiw 审计 + Atlasweb-F4 审视（候件 1）→ 双 PASS 后双信号（Main 落码 §1-§2〔+§3 产品面如触发〕+§4 / e2e 验收 §3+§6）。收口后：收尾工单 §7-11 格 1 豁免条件兑现销项 + 逐卷重登义务终止。

## §8 判词侧审视（Atlasweb-F4，2026-11-27）

**终判：审视 PASS——四点全采认，工单判据/纪律面闭合；非阻精化注记 4 条（不阻双信号发出，落码时折入）。**

**活码独立实勘五锚（@ f56ec92 时点 main，判词侧直证）**：

| 锚 | 实勘 | 结果 |
|---|---|---|
| 1 helper 背离 | :187 注释「直到 m180 入视口」逐字 vs :230 退出条件 `isVisible()` 逐字——注释≠实现背离成立；腿 7 内联副本 :188-192 同形；wheel -2000px/120ms ×30 轮 + :236 settle 800ms 与 §2 修形描述吻合 | 成立 |
| 2 红腿集 | 腿 9/10/11 :285/:312/:346 → `readToMidAndSettle` → :235 `toBeInViewport`；腿 7 :193 内联断言——§0 红腿四点线路逐一对上 | 成立 |
| 3 虚拟化有界窗 | :9 `useVirtualizer`（@tanstack/react-virtual）+ :136 `overscan: REPLAY_OVERSCAN` + :143 `getVirtualItems()` + :210 `computeVisibleRange`；实值 windowing.ts :15 `REPLAY_WINDOW_SIZE=60` / :18 `REPLAY_OVERSCAN=10`——§0 有界窗机制前提成立 | 成立 |
| 4 几何变更窗 | `82945c7..fbf03f8~1` web-code 恰 5 提交逐一吻合（3ade5f9/e5656f7/186e7c3/01081e4/45b6d6d 全 B 系 UI chrome）；`git merge-base --is-ancestor`：1487b19（锚负 offset 修复）**是** 82945c7 祖先——「A-gate 绿面祖先已洗」直证 | 成立 |
| 5 锚 effect 域 | 恢复/对齐 raf 收敛环 :156-190 + A3 锚持久化 effect :196-207（250ms debounce writeAnchor）——红线④保护对象在场 | 成立 |

**四点裁定**：

| # | 审视点 | 裁定 |
|---|---|---|
| ① | 主根因假说判据面 | **成立**。机制完备：overscan 行挂载（transform 定位、视口带外）→ 非空 bounding box → Playwright `isVisible()`=true → 循环提前退出 → 滚停于视口外 → ratio 0 断言红——恰释红签名三要素（locator resolve 成功 + ratio 0 + ×3 同签确定）。R1 探针先于修形（根因先于修）纪律正确 |
| ② | 暗窗两分形闭合性 | **闭合**。绿（覆盖恢复）/红×（helper 残余｜真产品缺陷）覆盖结果空间；×3 稳定滤 flake；不冒绿不冒销两面齐 |
| ③ | §4 并卷（自决 5-2） | **采认，不翻**。错配源为已定谳跑形缺陷（W1+E1 readonly 3 红 = 结构性反证）；A-gate 先例形已实跑成立（收尾轮格 5 = 145cec04 冻结副本专跑 3/3 + integrity 交叉核）；同文件族 test-infra 域 + 17/7 噪声即时收益，独立微波不成比例 |
| ④ | 红线四条 | **全部采认**。①机器可判性成立（`await expect(` 断言行 diff 可判）；②③④防滑点面齐——③ 尤要：`scrollIntoViewIfNeeded` 会绕开受测滚动机理（产品锚恢复 = scrollToIndex + raf 对齐环，helper 须真 wheel 驱动） |

**精化注记（非阻，落码/探针时折入）**：

1. **R1 探针判据增补**：探针须同时记录**循环退出方式**（条件退出 vs 30 轮耗尽）——「overscan 挂载即退出」与「30 轮耗尽仍未达」两子机理一并排除，逐轮 dump（scrollTop/窗口界）自然覆盖，判据面完整化。
2. **分支②证据标准**：暗窗两分之「真产品缺陷」裁定须**探针级直证**（boundingRect/窗口界与产品码行为对应），非红断言转述——与 R1 同证据标准，防误伤产品码。
3. **红线④保护域行引精化**：全保护域 = ConversationView :156-190 + :196-207（工单引 :166/:180/:207 均在域内，行引精化，零影响）。
4. **谓词差异观察**：修形循环退出判据（m180 与 transcript **容器**相交 ≥1px）与最终断言谓词（`toBeInViewport` = **浏览器 viewport** 相交）非同一谓词——前者为滚动机制正确参照，后者零改动为最终门；两谓词不一致时断言如实红、§3 两分兜底，**禁为对齐断言谓词而改断言**（即触红线①）。

**§6 判据格核**：六格内部一致（格 1 含腿 7 内联；21/21 含 candidate 13；格 5 断言零改动机器可判；D1 照 §7-7③）。无缺口。**§5 自决 1-5 核**：全部成立，与判词侧定性及既采认程序纪律无冲突。

> 审视链：工单全文读毕 → 五锚活码实勘（git 锚定 f56ec92 时点）→ 四点裁定 → 注记 4 条 → 本节。双门状态：判词侧审视 PASS（本节）；候 Atlas-reveiw 审计——双 PASS 后 f4 发双信号（Main 落码 + e2e 验收）。

## §9 f4 修形折入（Atlas-reveiw 审计必改 3 + 建议 2，2026-11-27）

- **审计结果**（@a9f3d85 时点，含 §8 判词侧审视折入版）：**方向 PASS；活码核对全 MATCH（判词侧五锚同值互证）+ 必改 3 + 建议 2** → 本节文本级修形全数折入：
  - **必改 1（实质）**：§2 修形改二选一形（mounted 后 bbox 双向校正 ∥ 粗→匀两相），并落审计机理直证（overscan 挂载带 + -2000px 步进相位跳窗 → 单判据替换可能旧红换新红）；§1 R1 增三行直证（退出侧别/步长 residue/overscan 实测像素）+ 退出方式 + 两谓词 rect 对表。
  - **必改 2**：§6-2 钉 22/22 全目录口径（B3 自腿 deliverables 1 入集）；§6-4 钉 `bunx tsc --noEmit -p tsconfig.json` + 开工前基线预验 = 0。
  - **必改 3**：§6-6 锚预注册 a4063946/57027aa3 + 合并触发重出锚显性条款（§3 分支②同此）。
  - **建议 2①②**：两谓词 rect 对表入 R1；§6-5 参数面逐项钉（含两相形参数）。
- **§8 注记 4 条全采认**（判词侧精化与审计建议合轨无冲突）；红线④保护域行引按注记 3 精化 = ConversationView :156-190 + :196-207。
- a9f3d85（判词侧 §8）随本修形 commit 一并推 origin（审计提醒兑现）。
- 双门状态：判词侧审视 PASS（§8）+ 审计方向 PASS（修形后候点核）→ **点核 PASS 即双门齐，f4 发双信号**。

## §10 f4 裁定：tsc 格撤除 + 基线差登记（2026-11-27）

- **事实**（Main §6-4 开工前预验回执）：主检出 020f3cb `bunx -p typescript@5.9.3 tsc --noEmit -p tsconfig.json` = **2072 pre-existing errors**（TS7026×774 / TS5097×396 / TS2307×234 / TS7016×167 / TS7006×122 / TS2580×98 等）——AtlasWeb 从无 tsc 门，全存量面零本波引入。另：审计钉命令形 `bunx tsc` 裸跑拉 TS 7.0.2（TS5102 拒 `baseUrl`，TS7 移除）——命令形本身须版本钉（typescript@5.9.3 实测可跑）。
- **裁定：Main 建议 (a)+(b) 并用采认**——(a) 本波撤除 §6-4 tsc 格（审计必改 2b 自带预授权条款之撤除支行使；基线差如实登记本节）；(b) **tsc 清零立项入挂账池**（2072 件量级独立硬化波，非微波；候波前方案另立，未排程）。命令形版本钉教训随挂账池件登记（裸 `bunx tsc` ≠ 可执行判据，版本钉后方为判据）。
- 本波判定口径不受影响：格 6-4 判据 = bun test canon 面（tests/ 纯面口径维持）。

## §11 根修收口裁定（f4，2026-11-27；e2e 验收判定单 `user-e2e/reports/r-20261127-viewport-rootfix-accept.md` 采认）

- **验收 PASS 采认**：§6 六格全绿 ×3 稳定（22/22 ×3 = candidate 13 + execution 8 + B3 自腿 1；对照 3/3 run-contrast.sh 固化形 + integrity 交叉核；bun 561/1skip/0 fail；格 5 机判断言多重集逐字恒等 + 参数钉逐项在场 + 禁 scrollIntoViewIfNeeded 零使用 + web-code 零触碰 + R1 归因四要素在 610ecc9 附注核真）+ §3 暗窗首跑 GREEN（**两分裁定 = A3/A4 覆盖恢复**——helper 残余 ∥ 真产品缺陷分支均未触发，腿 9/10/11 自 82945c7 起首次真跑即绿）。
- **f4 核真（多层独立）**：① 本 session 红线四条独立实勘（9b28206：断言行逐字恒等 50/30/15 + m360 移位非改写 + 参数零改 + web-code 零触碰 + 探针未入仓）；② 610ecc9 ↔ 9b28206 e2e/ 面树恒等（diff 0 行）；③ Main 自验独立互证（四红腿 ×3 = 12 passed + 22/22 + 对照烟测 3/3）；④ Atlas-reveiw blob 实读点核 PASS（与必改 1 双向/两相模型逐点合形）；⑤ e2e 判定轮（锚 #2 D1 双副本 + registry 145cec04 同值先例）。五源一致，无残留缺口。
- **收口事件成立**：
  - **第一波 §7-11 格 1 显性豁免条款销项兑现**——4 viewport 红根修完成（四前红腿 7/9/10/11 全转绿 ×3），**逐卷显性重登义务终止**（判词侧终判 @9d4e284 §2 同条款同销）；
  - #277 格 8 判读自此 22/22 全目录口径（四红豁免成历史形）；
  - 挂账池核销：pw readonly 腿跑形错配（W1+E1 §2b）已由 §4 run-contrast.sh 固化兑现销项；
  - R1 归因结论入 610ecc9 commit 附注 = W1+E1 §2a-3 登记候定谳面销。
- 波终态：viewport 根修波全链闭环（工单 §0-§11：草案 f56ec92 → 判词侧审视 a9f3d85 → 审计必改 3 → §9 修形 7f78bd4 → 双信号 → R1 探针 → 修形 9b28206 → 合并 610ecc9 → 锚 #2 不重出直证 → e2e 验收 PASS → 本节收口）。轨 B（#277 follow 切片）候件状态不变，与本波判定面不同域。
