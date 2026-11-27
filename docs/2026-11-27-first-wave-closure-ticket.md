# 第一波收尾波工单：B3 切片 + Node 20 边界腿 + F8/F9 对表 + 总验收链终局（2026-11-27）

作者：Atlasweb-F4（波前详细方案+审视环节，工单 §0 活码重核 + §5 审视记录）。角色矩阵：**落码归 Main**；审视/判据归 Atlasweb-F4 + atlas-mainline-f4；e2e 腿归 e2e；本工单送 Atlas-reveiw 审计，审计 PASS 后发双信号开工。

## §0 活码重核（@ AtlasWeb main `9e55e5d` × AtlasCode master `f6af96c9`，2026-11-27）

| 面 | 活码核真 |
|---|---|
| 附表 §4 B3 文件集 | `packages/web-code/src/views/{DeliverablesCard,StatusStrip}.tsx`、`src/settings/settingsPanel.tsx` **均不存在**（未开工，符合预期）；B2 面 QueueList/ApprovalCard 在位 |
| 挂载点活码 | 附表写「AppFrame 挂载、main.tsx」→ 实码 = **`apps/atlasweb/src/main.tsx`**（执行通道挂载 + R1 `?workspace=` hint 形 :61-84 在档）+ `packages/web-code/src/index.tsx`（槽位注册面）；web-layout 包在（AppFrame 概念域） |
| 引擎 pin | root + web-host 双 `@atlaswork/atlascode: 0.1.128`（4f892ab）；b12 R3 fixture PATH 前置形将自动供 0.1.128，零改 |
| Node 20 面 | 本机 node v24.22.1（无 nvm）；**docker 29.1.3 + daemon OK** → 容器形可行 |
| b12 登记面 | 发现列表面（披露②延续，原文「候 B3/接线工单」）+ runTurn 审批接线切片（R2，原文「候呈批」）+ Minor ①–⑦ 记账延后；终验基线形态 = A 链 18 腿（grep-invert 对照）+ 执行 pw 5/5 + 全仓 511/1/0 |
| 主计划终验行 | e2e 独立安装同字节制品跑 A+B 与 F1–F7，F8/F9 对表、F10 登记；双尺寸、无/过期凭据、工作区隔离、旧只读回归；**缺任何硬格不给第一波通过** |
| F6-PAGE 交界 | 接口格已销（0.1.128 双 org + §N @c58952ea）；**UI 消费登记未销**（§M 钉死措辞）——归属裁定见 §5-1 |

## §1 切片 1：B3 — 产品状态、交付物与设置（落码归 Main）

基线 = 附表 `docs/superpowers/plans/2026-11-20-first-wave-b-implementation.md` §4（B0 冻结合同，文件/接口/判据不再改写，此处只列工单增量）：

- **判据（原文冻结）**：`installed app completes and reopens an isolated coding task`（真实任务改文件、跑测试、刷新回读全程）；交付物卡（F8）基于内核真实输出，无内核交付面则显式登记差异不造假；设置面板（F9）只展示受支持设置有效值，无空壳开关；F4/F5 保持清晰 Atlas/Code 工作面。GREEN = 单测 + `--grep 'completes and reopens'` + 镜像安装包保留 A 全链回归腿。
- **工单增量①（加性切片，§5-2 裁定；审计必改 4 修形——文件级落点逐件具名）**：workspace 发现列表面（b12 §5 披露②延续）并轨本切片。文件级落点：
  - 新增 `packages/web-code/src/views/WorkspaceListPanel.tsx`（列表/选择 UI）；
  - 修改 `apps/atlasweb/src/main.tsx`（executionWorkspace 来源 = 列表选中项；`?workspace=` hint 保留为深链回退形——返工面 b12 预注收敛本文件）；
  - 修改 `packages/web-code/src/index.tsx`（挂载/槽位接线，B1 接线 e5656f7 同域）；
  - **新增 web-host 只读 discovery 端点**（现无列表路由——活码定谳：workspace 注册面 = 启动参数 `--workspace id=dir` 授权制，launchCli.ts:43/:66-67/:87/:114 grantWorkspace，httpHost 无列表路由）：GET 只读返 workspaceAuth 已授权 `{workspaceId}` 列表，零目录内容/零凭据；**路由层安全形（审计复判注记 4 预注册）**：auth fence 后、与 `/sessions` 同层、未认证零泄漏、响应仅 workspaceId 字符串；落码计划定谳具名路由并回填本行（端点亦属扩格文件件，逐文件登记纪律同）；
  - web-connection 增只读取列表方法（若经 HTTP 传输面）。
  - **单测腿（附表 §5 每切片门）**：① 列表选择 → executionBinding 源 = 选中项（`executionBinding.test.ts` 增腿）；② 无选择且无 hint → 零渲染回归形；③ host 端点返值 ≡ 已授权集（fail-closed：未授权零出现）。
  - **纪律复述**：选择 ≠ 授权——授权权威 = 服务端逐命令 workspaceAuth（E1），b12 Issue 3 裁定不改；列表可见性不预授任何提交权。
  - pw 腿一条：列表选择后提交回合 wire 形与 hint 形等价。
- **工单增量②**：B3 三卡与发现列表均走现有 `data-*` 断言词表纪律（b12 R6 词表零命中形保持）；只读红线不变（真实任务腿用隔离临时工作区 + 临时 ATLAS_CONFIG_DIR，b12 R4 定谳形复用）。

## §2 切片 2：Node 20 最低边界腿（e2e，容器形，§5-4 裁定）

- 容器 = `node:20`（docker 29.1.3 本机可用）；对象 = 终验候选 tgz（同字节锚）。
- 判据（A1 RED 判据子集，预注册）：① 容器内干净 HOME + 空缓存 `npm install --offline <tgz>` exit 0，安装目录不在源码仓下；② `.bin/atlasweb` 启动 → `Search sessions` textbox visible；③ 无授权 401 alert 形；④ 非法/缺失 scope 非零退出且无 listener。全腿 exit 0/断言绿 = PASS。
- 登记（a5 原文兑现）：「Node 20 最低边界腿须在产品终验前补跑，未跑不给产品总通过」——本切片即该补跑。

## §3 切片 3：F8/F9 对表（终验前置预注册，e2e+Main 合力）

- F8 交付物卡：对表单 = 内核真实输出（turn.completed 转录 + 隔离工作区磁盘 diff）≡ 卡面展示；无内核交付面 → 显式登记差异（附表 §4 原文，不造假）。
- F9 设置面板：对表单 = 只展示受支持设置有效值；逐开关核有效值来源（settings 池），空壳开关 = 红格。

## §4 切片 4：总验收链终局（e2e，产品第一波终验）

- **同字节制品**：@atlaswork 面候选（本地测试统一走 @atlaswork 纪律），sha256 锚预注册于呈批书；e2e 独立干净沙箱安装（安装品 sha 复核 = 锚）。
- **判据格（预注册，全绿才给第一波通过）**：
  1. A 链 18 腿（`--grep-invert "\[对照\]"`，b12 协议注记形）×3 稳定绿；
  2. **B 面 pw 全腿（审计必改 2 修形）= 执行 5 腿 + B3 自腿 `completes and reopens`（'completes and reopens' 隔离任务全程）+ 发现列表腿 1 条**——于终验沙箱同字节制品重跑（b12 基线 5/5 系 B3 未落时点形，不得冒充终验 B 面）；
  3. F1–F7 逐格对表（主计划映射：A1 安装/A2 滚动定位/A3 导航刷新/A4 断线续读/A5 装包交验/F4/F5 工作面）；
  4. F8/F9 按 §3 对表单逐格；F10 显式登记延后；
  5. 双尺寸（长短会话）+ 无/过期凭据 fail-closed + 工作区隔离 + A0 对照 3/3（registry 旧制品）；
  6. Node 20 边界腿（§2）PASS；
  7. 全仓回归：AtlasWeb `bun test`（**tests/ 纯面口径**，§5-6）+ AtlasCode 侧不受本波触碰面免跑；
  8. 审批正腿形态：**已裁全形（用户 2026-11-27 亲裁：形 A + 随波并行，§6 裁定落档）**——runTurn 审批接线切片随本波并行落地，pw 审批腿补齐入总验收全形跑；受阻登记形不再启用（b12 R2 先例仅存档引用）。
  9. **交接件（审计必改 1 修形；主计划「总验收与交接」第 2 项原文格）**：给用户可亲手走的安装/启动流程与隔离演示工作区——产物形 = 交付文档一页（安装命令→启动命令→演示工作区路径与说明，命令逐字可复制）+ 判据 = e2e 或 F4 依该文档**独立走通**安装→启动→演示工作区（只读一例 + 执行一例），零额外口头步骤；走不通 = 红格（「缺任何硬格不给第一波通过」适用）。
- F4 只据证据裁定；缺任何硬格不给第一波产品通过（主计划原文）。

## §5 审视记录（逐点自决/报裁）

| # | 点 | 裁定 | 依据 |
|---|---|---|---|
| 1 | F6-PAGE UI 消费（load-older 翻页）归属 | **自决：独立 UI 波，不折入 B3** | §M 钉死措辞「后续 UI 波另立工单」——折入须改登记+呈用户敲定，冒销风险面；B0 冻结附表 §4 文件集不含 ConversationView 翻页面，扩格须改冻结合同；判据域不同。UI 波工单由 atlas-mainline-f4 起草案送本侧审视 |
| 2 | workspace 发现列表面归属 | **自决：并轨 B3 波（工单增量①）** | b12 §5 原文预登记「候 B3/接线工单」两可皆合规；判据域 = 执行面接线（R1 形取代）非纯展示 UI；并轨避免 UI 波范围膨胀。**加性扩格显性登记**（附表 §4 文件集 + 发现列表），随工单送审计专核 |
| 3 | runTurn 审批接线切片 | **报裁 → 已裁（用户 2026-11-27：形 A + 随波并行）** | b12 R2 原文「候呈批」；不阻切片 1–3 先行；裁定落档 §6，终验格 8 = 全形 |
| 4 | Node 20 腿形态 | **自决：docker 容器形** | a5 预登记「容器/CI 形均可」；本机 docker daemon 实测 OK |
| 5 | 切片顺序 | **自决：B3 → Node 20+F8/F9 → 总验收链** | 合流 atlas-mainline-f4 排程催单序（两头并进无异议） |
| 6 | 全仓回归扫描面 | **自决：tests/ 纯面口径** | bun test 位置参数=子串过滤器教训（AtlasCode memory bun-test-substring-filter）；呈报计数注明扫描面 |
| 7 | e2e 预跑禁令 | 维持 A-gate 先例 | 不预跑不预占，候审计 PASS 双信号 + Main 候选锁面 |

## §6 呈批件：runTurn 审批接线切片产品形——**已裁（用户 2026-11-27 亲裁：形 A + 随波并行）**

> **裁定落档**：采**形 A**（runner **调 kernel 供给的 requestApproval**——host approvals 仅证据落档、decide 经 kernel，权威路径详见下产品形钉死节）；时点 = **随本收尾波并行落地**，总验收前 pw 审批正腿补齐，终验格 8 跑全形。落码归 Main；e2e 两形态执行面均可承接（atlas-user-e2e #276 知会回执），按全形预备。以下呈批原文存档（初稿「报 host 审批队列」表述已在钉死节校正，引述勿回旧措辞）。

- **缺口**（b12 R2 定谳）：`spawnCliTurnRunner` 不消费 `requestApproval`——kernel/host/客户端审批面已落（B2 单测+UI），runner 侧消费接线不在 B2 范围，pw 审批正腿结构性不可达。
- **形 A（已裁·产品形钉死，审计必改 3 修形）**：
  - **权威路径（钉死+活码援引）**：「runner 收 requestApproval」实义 = **runner 调用 kernel 供给的 `requestApproval`**（AtlasCode `src/kernel/execution/executionKernel.ts:41` runTurn options；:270-294 kernel 构造 → `approval.requested` + 300s timer + turn 绑定；:380 `approval.decide` 结算）→ host approvals 仅**证据落档**（七字段纪律）→ UI ApprovalCard → decide **经 kernel** 结算 → runner 消费 kernel 判决继续/终止。防滑点：实现不得绕 kernel 直通 host（无 host 直通旁路）；本工单初稿「报 host 审批队列」表述据此校正。
  - **何时触发（b12 §5 两问之一·候选设计）**：引擎在需授权动作点经 stream-json 事件面发**结构化审批请求事件**（禁 control-request 形复用）；runner 捕获 → 调 kernel requestApproval（上路径）→ 300s timer 由 kernel 计时（b12 既有形）→ 超时 = expired 终态（AtlasWeb 只展示，上游计时纪律不变）。
  - **审批内容从何来（两问之二·载荷纪律）**：事件字段集 = 工具名/动作摘要/工作区 id/turnId/approvalId/请求时点/来源车道——**事件字段，非正文/令牌/待批内容**（七字段纪律）；UI 展示面同源同界。
  - **carrier 契约增补分支（定谳件，落码计划 §0 首件）**：若 0.1.128 引擎 stream-json 已含结构化审批请求事件形 → 零 carrier 触碰；若不含 → carrier 契约增补 → **新 carrier 版本走段 L 形发布链（L4 用户亲署）→ 终验候选须含审批接线重出**。随波并行裁定的后果面照登：终验候选 = 审批接线落地后重出之候选。
- **形 B**：引擎侧允许清单预授权（减少运行时审批交互）。缺点 = 审批语义旁路面、与 E4/E5 冻结判据不接、安全面弱于 A。
- **裁点**：① 采 A/B；② 时点——随本收尾波并行落地（终验前）or 终验后另波（终验格 8 走受阻登记形）。
- 约束（B2 既定）：禁复用 CLI control-request 审批面；审批内容不含正文/令牌/待批内容（七字段纪律）。

## §7 信号面

1. 本工单 → Atlas-reveiw 审计：一轮 @e38a9d8（方向采认 + 4 必改）→ 修形 @42c5251 → **复判 PASS（0 必改）@42c5251**（2026-11-27）；
2. **复判 4 非阻注记处置（本 commit）**：① §6 摘要句旧措辞校正；② discovery 端点路由层安全形预注册（§1）；③ **预跑例外登记**——Main lane（AtlasCode job 1b9594d7）于复判 PASS 前已起 B3 落码面（草案工单 + 三视图/settings/单测/接线 ~200 行未提交；草案 §0 系附表 §4 基线、缺增量①）：例外登记，**落码以 42c5251 修形版为唯一准绳**，草案随动更新（增量① 发现列表件 + 审批接线切片〔形 A〕补入），已起面对 42c5251 对表、差异面 Main 补齐；④ carrier 分支**定谳落定：增补支成立**（Main 落码计划 §0 首件 @01081e4，判词侧独立复核 + 审计初扫三源一致）——0.1.128 stdout stream-json 事件类型面枚举（assistant/connected/control_response/deferred/error/error_during_execution/json_schema/pending/result/success/tool_use/user）**无审批请求事件形**；审批现形仅 = `control_request`/`can_use_tool`（print.ts:549/:825/:2635，SDK 控制协议=禁复用面）+ mailbox `permission_request`（teammateMailbox.ts:454/:577，非 stdout 面）→ **carrier 契约增补结构化审批事件 → 新 carrier 版本（候 0.1.129）走段 L 形发布链（L4 候用户亲署）→ 终验候选重出**；Main 增补件呈批材料随后；
3. **双信号已发**（复判 PASS 后）：Main = 切片 1 + 审批接线（形 A）落码按 42c5251 修形版（正文条件：执行波草案随动更新含增量①）；e2e = 切片 2/4 判据预注册开工，执行候 Main 候选锁面（全形预备）；
3. §6 呈批件已呈已裁（用户 2026-11-27 亲裁：形 A + 随波并行）——终验格 8 = 全形；
4. UI 波（§5-1）独立工单另行走审计链，不入本波。
5. **0.1.129 L4 预授权亲署在案（2026-11-27，用户于 atlas-mainline-f4 session 亲键 = 有效亲署，0.1.125/0.1.128 通路）**：原文「**版本候 0.1.129，L4 届时候你亲署，我已经授权过了，直接干就可诶**」——段 L 形链（carrier 增补版候 0.1.129）L4 全范围预授权（tag → push 双远端 → npm 主面 → 镜像同 tgz 仅改 name 双发 → packument 验真）；**条件面（授权非跳门）**：GATE-PASS + 呈批书批复双门照旧，亲署仅消除「候亲署」等待支（0.1.128 呈批书 §5 同形）；**执行单点 = atlas-mainline-f4（job 9d1c80df，持授权原文 session，0.1.128 L4 亲执先例同形）**；0.1.129 呈批书 §5 届时折入本记录；本节 2 之 ④ 项「L4 候用户亲署」自本条起 = **预授权在案**。
6. **W1 偏离回档登记（f4 钉载体 2026-11-27，Atlasweb-F4 查询采认）**：841a526「upstream result 行 stdin 收口修形」= 呈批书 §2 W1-a 注册形（stdio `['pipe','pipe','pipe']` 仅本 lane + pending-gated 零窗口零读取 + 无审批回合零写入）之外的 **W1 波内新根因修形**——r-20261127 悬挂根因定谳：三 pipe 形 host 永持 stdin → 引擎 result 后不退 → close 不 fire（r-20261122 同族第二犯，机制不同层）；修形 = result 行到即 `stdin.end()`，结算权威不变（close/exit code，leg ⑥ 双证）。**定性 = W1 新码在册形实现后暴露的缺陷修复，非注册形偏离**（预登记纪律「偏离形回本档改注册」适用于注册形之变更；本件 W1-a 如注册实现，悬挂系新 pipe 形与引擎退出条件交互之新缺陷）；批复后落码，Atlas-reveiw W1+E1 审计必审面 1 直证成立 + e2e 权威判定 GATE-PASS 覆盖（r-20261127-atlasweb-w1e1-gate.md）。**载体 = 本节；呈批书维持封卷 @87d2b424 不重开**（§11 已为事后核折入终态）。
7. **终验锚时点勘正裁定（f4，Atlas-reveiw 判定单核真 2026-11-27）**：Atlas-reveiw 独立直证判定轮制品锚时点混淆——入检锚 ac9db24d（15:28 build）在判轮 canon（15:46）内被 npmPackage.test ②⑥腿就地 build-npm-package.ts 重建覆盖（build/*.tgz → 4453394b/df650ba7），pw 实装 = post-canon 字节 df650ba7，ac9db24d 全盘不复存。**实质不受损**（df650ba7 = 清洁 21a7e1e 确定性重建、Atlas-reveiw 复跑字节恒等 + 包内 carrier 0.1.129/85e9b293 直证）。**f4 裁定**：① 锚行勘正归 e2e 增补件（判定单 §0/§3① 双值「入检 ac9db24d / 判时实装 df650ba7」，谁写谁勘）；② **终验候选主锚 = df650ba7…d0bb64（可复现确定性重建值）**，ac9db24d 登记为不可复现入检值——切片 2/4 预注册档锚位回填按此；③ Atlas-reveiw 建议 2 采认为 e2e 判定轮程序纪律（ATLASWEB_TGZ 指冻结副本：判前 copy+sha 取证+判后复查；build/ 发布面不作判定源）；④ 同源异字节归因说明归 Main（登记 1，差异最可能 = manifest atlaswebCarrier.version 单字段 stale node_modules 形）。
8. **终验候选锁面落档 + 锚位回填（Main lane，2026-11-27；§7-7 裁定②兑现）**：终验同字节制品锚预注册落档 **`docs/sri/v0.1.3-final-candidate.md`**——主锚 = atlaswork tgz sha256 **df650ba7…d0bb64**（281,570B）+ atlasharness 镜像 **4453394b…337f1**（281,573B），构建源 main `3a2aa55`（工作树干净），双 org 同源重建字节全等实证在案；载体 0.1.129 三值（cli.js 62bbc6cf / runtime 85e9b293 / execution 921d0ab7，f4 备档）本机 node_modules 直证全等；staging manifest 内嵌 `atlaswebCarrier = {0.1.129, 85e9b293…}` 直证。切片 2 对象 = 本锚 tgz；切片 4 同字节制品 = 本锚（e2e 判定源冻结副本纪律照 §7-7③）。**同源异字节归因说明（§7-7④ Main 义务，登记 1）**：ac9db24d 系 W1 worktree（`/home/vince/atlasweb-worktrees/w1-approval-channel`，HEAD 841a526）build/ 产物；构建时点 worktree package.json pin 已 0.1.129（84b194e）但 worktree bun.lock 未随更新（归正 21a7e1e 系合并后主树行为）且 node_modules 未重装——与判定单假说（manifest atlaswebCarrier.version 单字段 stale node_modules 0.1.128 形）一致；残件已被判定轮 npmPackage.test 就地重建覆盖、worktree 目录已删，字节级复核不可得，以假说登记归档。**B3 切片 1 余面核销：无在途**（工单回执 §5.1 三视图 + §5.2 增量① + e963f7c pw 腿全落 master；'completes and reopens' 腿入切片 4 判据格 2 全形跑）。**UI 波锚 = 0.1.129 三值**（f6page 工单 §4 前提锚登记同批回填，零返工面）。

9. **格 2/格 9 收尾余面处置落码（Main lane，2026-11-27 晚；r-20261127-closure-verdict §3 建议序①②兑现）**：
   - **格 2 B3 自腿落码（c80f671）**：新增 `e2e/first-wave-deliverables.pw.ts`——`installed app completes and reopens an isolated coding task` 全程腿：真实多工具任务（calc.js bug 修复 + test.js 创建运行，引擎 Read/Edit/Write/Bash 链）+ 审批循环真 UI 批准（data-exec-approve，不预设次数）+ 工作区 fs 终证（runner 亲自重跑任务测试，非卡面转述）+ R-B3-1/R-B3-2 双卡 data-* 词表全程投影（data-deliverables-activities 0→≥1）+ reload 回读（E6 形）。形纪律：隔离临时工作区 + 临时 ATLAS_CONFIG_DIR = fixture 内建（b12 R4 定谳形）；词表全出自 views 源。**Main 验证**：对前锚 df650ba7 实跑 1 passed（36.7s）；首跑红 = activities 属性在卡面子 div 的定位器层级错位（测试缺陷，三处修正后绿），产品面零缺陷信号。
   - **格 9 README 修订（774d3bc，纯文档面）**：新增 `Execution lane (interactive coding sessions)` 节——`--execution --workspace id=dir --actor-id` 三 flag 逐字可复制（launchCli.ts 解析面逐字核对）+ 选择≠授权 + `?workspace=` hint / discovery list 入口 + 引擎前置件（@atlaswork/atlascode PATH 可供 + ATLAS_CONFIG_DIR settings/.credentials.json）+ JSONL 落盘与 **`/` `.` 双映射编码注记**（判定单 §2 登记 1）；撤 ：14-15 「Read-only by contract」陈旧断言（登记 2）改述默认只读面 + 执行面挂载条件；单次 token 语义注记补执行节尾（登记 3）。登记面小注记：`data-session-id` 双载体（nav button + DeliverablesCard div）供后续 fixture 作者参考（零码改动）。
   - **候选锚重出（superseding）**：README 打包进 tgz → 字节变——重建双 org：atlaswork **a4063946…7309b**（282,545B）/ 镜像 **57027aa3…dae8b**（282,548B），构建源 main `774d3bc`；确定性复跑恒等 + 与前锚逐文件 diff = **仅 package/README.md 一文件异**（dist/server/package.json 全等，产品行为零变）；前锚 df650ba7 归档 `build/*-g2g9-archived.tgz`。锁面文档 superseding 节落档（`docs/sri/v0.1.3-final-candidate.md` 顶部，a4-candidate 先例形）；载体三值不变（0.1.129 pin 未动）。
   - **e2e 复验单信号已发**：对象 = superseding 锚 a4063946（冻结副本纪律照 §7-7③）；面 = 格 2 全形（execution 8 腿 + B3 自腿）×3 + 格 9 走通复跑（执行例凭修订 README 独立走通）；格 1 四 viewport 红维持根修波候选，放行处置（根修销项 or 显性豁免）呈终判裁量。

10. **格 2/格 9 复验 GATE-PASS 回执落档（Main lane，2026-11-27 深夜；e2e 判定单 `r-20261127-closure-reverify.md`）**：
   - **锚位**：D1 冻结副本两锚判前判后 sha MATCH（atlaswork a4063946 / 镜像 57027aa3）；vs 前锚逐文件 diff 仅 `package/README.md` → 产品行为零变更确定性桥，superseding 成立。
   - **九格终账（全绿）**：格 2 = execution 8 腿 + B3 自腿 9/9 ×3 轮全绿（B3 全程直证：buggy 预证 → UI 提交 → 真 UI 审批循环 → 队列排空 → fs 终证 → 双卡投影 → reload 回读），缺口①销；格 9 = 修订 README 四缺口项全落文（安装品 'Execution lane' ×2 在档），walk11a 只读形 + walk11b 执行形零 fixture 依赖独立走通双绿，红格销；格 1 四 viewport 红维持 pre-existing 零引入，根修波候选放行呈 F4 终判裁量；余六格维持前判定单绿。
   - **观察项 Main 裁定（e2e 诚实登记，非产品缺陷）**：walk11b 首轮失败 = 沙箱装配缺口（`--workspace demo=$W/ws` 目录未创建，服务端静默接受、引擎 cwd 缺失回合无法启动）。**裁定 = 加固候后继加固波，不在本收尾波落码**——① GATE-PASS 判在锁定锚 a4063946 上，加固 = dist 字节变 → 锚三度重出 + 格 2 全形复跑，成本与非阻塞观察不成比例；② 现症为即时可见失败（回合无法启动、操作者单轮内可定位），非静默数据损坏面；③ 已登记挂账池（fail-closed 加固候选：`--workspace` 目录缺席时启动报错退出）。
