# B3 执行切片波工单 — 产品状态、交付物与设置（第一波 B 附表 §4）

> 波：B3（B1 地基 @e062138 → B2 执行通道 @b12 波 → **B3 本波**）。
> 排程：f4 采认串行 ①B3 → ②Node 20 腿（F8-F9 预对表）→ ③总验收链（终裁，
> 归 e2e 单信号）。落码单点 = AtlasCode Main lane（job 1b9594d7）。

## §0 范围（B 附表 §4 原文增量）

- 新增 `packages/web-code/src/views/StatusStrip.tsx`（产品状态条）。
- 新增 `packages/web-code/src/views/DeliverablesCard.tsx`（交付物卡，F8）。
- 新增 `packages/web-code/src/settings/settingsPanel.tsx`（设置面板，F9）。
- 挂载接线 + RED 判据腿 `installed app completes and reopens an isolated
  coding task`（pw `--grep 'completes and reopens'`）。
- 切片门 = 对应浏览器腿 + 单测 + 只读全回归不退（A 链 e2e 重跑）。

## §1 侦察事实（2026-11-27，Explore 代理）

1. AppFrame（packages/web-layout/src/client/AppFrame.tsx）root children 已有
   `shell.bottom`（single）/ `shell.overlay`（list）现成槽；`shell.bottom`
   渲染于帧底行（data-shell-bottom）。
2. web-code 惯例：inject 闭包注入 ObservableSnapshot hooks + `standard.useXxx`
   选择器；视图 = 纯投影 props；data-* 词表（data-exec-*、data-conversation…）；
   css 两族 `web-code-*` / `webcode-exec-*`（views.css，dsh token）。
3. ExecutionStatusModel（execution/executionController.ts:56-66）：phase
   ('idle'|'probing'|'ready'|'disabled'|'error') / error / streamError /
   queue{runningTurnId,queuedTurnIds} / pendingApprovals / settledApprovals /
   lastCursor。turn 终态只清队列，status 不留 per-turn 终态标记。
4. **内核无交付面**：web-host 路由全集无 deliverables/files/artifact API；
   projection VM 只有 text/activity/annotation 块。
5. **产品唯一受支持设置 = 主题**（web-brand ThemeSettingsHost：preference
   light|dark|system + fontSize/codeFontSize/terminalFontSize/字体族；
   fail-closed 校验）；web-host 无 settings HTTP 面。
6. pw 装置在根 `e2e/`（playwright.config.ts testMatch '*.pw.ts'，与 bun test
   正交）；fixture `e2e/fixtures/installedApp.ts`：installTgz 离线装候选 tgz +
   launchInstalledBinExecution（ATLAS_CONFIG_DIR 临时拷贝，缺席 exit 1；PATH
   前置 node_modules/.bin = R3 机制 @installedApp.ts:391）。
7. web-code 单测 = SSR `renderToString`（packages/web-code/test/*.test.tsx），
   无 jsdom。

## §2 设计裁定（ledger）

- **R-B3-1**：StatusStrip 挂 `shell.bottom` 单槽，web-code apply 内注册、仅
  execution 通道注入时挂载（只读红线保持——纯只读模式零渲染）。内容 =
  phase/running/pending/streamError 真实投影，data-status-strip 词表。
- **R-B3-2（F8 不造假条款）**：载体无内核交付 API → DeliverablesCard 只基于
  ConversationModel 真实输出（activity 块计数 + 最近 assistant 文本尾部），
  卡面明示「转录推导 · 载体无文件级交付面」；**F8 差异登记本 §4**，不虚构
  文件清单。挂载 = 既有 main 'conversation' 注册内 ConversationView 之下
  （免开 keyed 面板导航）。
- **R-B3-3（F9 无空壳开关）**：settingsPanel 只展示主题设置有效值（唯一受
  支持设置族）；ThemeSettingsHost 由 apps/atlasweb/src/main.tsx 经 web-code
  config 注入（settings.themeHost 槽）；无 host 注入 → 面板零渲染（fail-
  closed）。挂 `shell.overlay` list 槽（自含浮动 toggle，data-settings-*）。
- **R-B3-4**：AppFrame 零改动——现成 shell.bottom/overlay 槽足敷（B 附表
  「修改 AppFrame 挂载」按侦察事实收窄为「经既有槽挂载」）；main.tsx 改动 =
  传 themeHost + 无其他。
- runTurn 审批 pw 真体腿：候 Atlasweb-F4 波前审视裁定是否随本波 RED，不预埋。

## §3 门（RED→GREEN）

1. RED：`packages/web-code/test/b3Views.test.tsx` 三卡 SSR 形断言（先跑红）。
2. GREEN：三视图 + 接线落码 → 单测绿。
3. pw 腿：`e2e/first-wave-deliverables.pw.ts` —— 提交真实任务（隔离临时
   工作区 + 临时 ATLAS_CONFIG_DIR，b12 R4 形）→ 完成态 → reload 回读（
   'completes and reopens'）→ StatusStrip/DeliverablesCard 在场断言。
4. 只读全回归：bun test 全仓不退（517 pass 基线）+ pw A 链 existing 腿。

## §4 F8 差异登记（登记即销项依据，不造假）

载体（@atlaswork/atlascode 0.1.128）无 files/deliverables 读取 API；交付物卡
的「交付物」语义本波收窄为**会话内可观察产出证据**（activity 块 + assistant
终文本）。文件级交付面（如内核 files list API）登记 UI/内核后续波候选，不在
B3 谎称达成。总验收链 F8 对表按本登记语义执行（f4 已裁：预对表在②、终裁在③）。

## §5 执行回执

### §5.0 准绳切换（2026-11-27，Atlasweb-F4 开工令 + 工单复判 PASS @42c5251）

落码唯一准绳 = `docs/2026-11-27-first-wave-closure-ticket.md` @42c5251 修形版
（+采记 22216c4）。本草案随动更新（工单 §7-2③ 预跑例外对表义务）：

- **增量① 并轨本波**（工单 §1）：workspace 发现列表面——新增
  `packages/web-code/src/views/WorkspaceListPanel.tsx`；main.tsx
  executionWorkspace 来源改列表选中项（`?workspace=` hint 保留深链回退）；
  index.tsx 挂载；web-host 只读 discovery 端点（auth fence 后、与 /sessions
  同层、未认证零泄漏、响应仅 workspaceId 字符串；路由名落码定谳回填工单）；
  web-connection 只读列表方法；单测三腿（选择→binding 源 / 无选择无 hint
  零渲染回归 / 端点返值≡已授权集 fail-closed）；**选择≠授权纪律**（服务端
  逐命令 workspaceAuth E1 不改）；pw 腿（列表选择 wire 形≡hint 形）。
- **审批接线切片（形 A）随波并行**（用户 2026-11-27 亲裁，工单 §6）：权威
  路径钉死 = runner 调 kernel 供给的 requestApproval（executionKernel.ts:41/
  :270-294/:380）→ host approvals 仅证据落档 → decide 经 kernel；禁 host
  直通旁路；触发 = 引擎 stream-json 结构化审批请求事件（禁复用 control-request）；
  载荷 = 七字段事件纪律。
- **carrier 分支定谳（落码计划 §0 首件，本 lane 已执行）**：AtlasCode
  0.1.128 源面 grep 核真——stdout stream-json 审批现形仅
  `control_request`/`can_use_tool`（print.ts:549/:825/:2635，SDK 控制协议
  = 工单禁复用面）+ mailbox `permission_request`/`sandbox_permission_request`
  （teammateMailbox.ts:454/:577，engine/messaging 域非 stdout 面）；**无独立
  结构化审批请求事件 → 定谳 = 增补支**：carrier 契约需增补结构化审批事件 →
  新 carrier 版本走段 L 形发布链（L4 候用户亲署）→ 终验候选重出。已单信号
  知会 Atlasweb-F4（2026-11-27）。
- 本草案原 §2 R-B3-4 中「AppFrame 零改动」维持；返工面按 b12 预注收敛
  apps/atlasweb/src/main.tsx 一文件（与工单增量①同文件，无冲突）。

### §5.1 切片 1a 回执（三视图 + 接线，2026-11-27）

- RED→GREEN：`packages/web-code/test/b3Views.test.tsx` 8 测试（先红：模块
  缺 → 后绿 8/8）。
- 落码：`views/StatusStrip.tsx`（shell.bottom，execution 注入时注册）/
  `views/DeliverablesCard.tsx`（F8 转录推导 + 差异登记明示）/ 
  `settings/settingsPanel.tsx`（F9 主题有效值，host 缺席零渲染）；
  index.tsx 三注册 + DeliverablesCard 挂会话下；main.tsx themeHost 注入；
  views.css 三族样式。
- 词表走审：`pendingApprovals` 命中词表词 approval → docs/t6a-readonly-lexicon.md
  §3 行 5 逐文件豁免 + gate-shapes 配对码形（`disposeStrip = execution !== null`）
  + 可见文案中文化「待批」零 dist 字面量；smoke 负腿 + dist 腿复绿。
- 回归：web-code + smoke 109 pass / 0 fail（root-supply 接线断言随三注册
  行为同步 2→3）；全仓回归随切片门终跑。


### §5.2 增量① 回执（workspace 发现列表面，2026-11-27，commit 45b6d6d）

- RED 确认：host/connection 6 fail + web-code 4 fail/1 error（10 fail）。
- GREEN 落码（11 文件 470 insertions / 18 deletions，commit 45b6d6d）：
  - web-host：`workspaceAuth.listGranted()`（仅 id 字符串，零目录内容）+
    `httpHost` GET `/execution/workspaces` 路由（auth fence 后、/execution
    路由族、未认证 401 零泄漏、执行面未启用 404、空授权 → 空数组）。
  - web-connection：`listWorkspaces()`——裸 JSON（/execution 族非 envelope）
    + fail-closed 形校验（每项恰 1 键且 workspaceId 非空串；越界字段 →
    invalidRequest；404 → AtlasConnectionError 带 status）。
  - web-code：`WorkspaceListPanel.tsx`（data-workspace-list/-option/-selected
    词表；空列表零渲染 fail-closed）+ `config.execution.workspaces` 加性类型 +
    选择 store（apply 内 getSnapshot/subscribe/select 三方法形；select 幂等
    同值短路）+ binding wrap（**选中项优先，`?workspace=` hint 深链回退**）+
    选择变化触发 `execution.attach()` 换绑（同会话切换先例）+ main 注册
    inject `workspaceSelection` 钩子 + Conversation 组件面板渲染（置
    ConversationView 前）。
  - 组合根 main.tsx：**预建连接**（credential 预解析传 applyCode——launch
    token 单次性，防 E2E Bearer lane 双重 redeem 炸裂）+ discovery 预取
    （404/错误 → 空列表 fail-closed，不阻塞首屏）+ 挂载条件（hint 在场 OR
    列表非空；**列表空且无 hint = 纯只读零挂载**，保只读红线）。
  - views.css：`.web-code-workspaces` 族（对表 deliverables 族先例）。
- 测试回执：workspaceDiscovery 4 腿（返值≡已授权集且零 dir 泄漏 / 无 cookie
  401 零泄漏 / execution off 404 / 空授权空数组）+ workspaceList 3 腿（裸
  JSON 交付 / 5 形外形状 invalidRequest / 404 透传）+ b3Views 2 腿 + 
  executionBinding 4 腿（① 列表选择→binding 源=选中项 {workspaceId:'ws-b',
  sessionId:'s1'} phase ready；② 无选择无 hint→phase disabled 零开流回归形；
  hint 优先级：ws-hint 先生效 → select('ws-a') 换绑 ws-a；回归：缺 workspaces
  → 钩子 undefined）全 GREEN。
- 回归：全仓 **538 pass / 1 skip / 0 fail**（71 文件）；gateTruthTable
  clean-candidate gap 提交前如实 gap、提交后复评 5/5 翻转（自指机制按设计
  工作）。
- 纪律保持：**选择 ≠ 授权**——选择只改客户端 binding 意图，服务端逐命令
  workspaceAuth（E1）对表不变；pw 腿（列表选择 wire 形 ≡ hint 形）随 §5.4
  e2e 波落。
