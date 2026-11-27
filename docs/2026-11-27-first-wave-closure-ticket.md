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
- **工单增量①（加性切片，§5-2 裁定）**：workspace 发现列表面（b12 §5 披露②延续）并轨本切片——列表/选择 UI 落地后取代 R1 URL hint 最小形，返工面收敛 `apps/atlasweb/src/main.tsx` 一文件（b12 预注）；判据单列：列表选择 → executionWorkspace 来源改为选中项，无 hint 恒等回退只读形（现有零渲染回归腿保持）；pw 腿一条（列表选择后提交回合 wire 形与 hint 形等价）。
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
  2. 执行 pw 5/5（真引擎回合；引擎 PATH 按名供给 0.1.128）；
  3. F1–F7 逐格对表（主计划映射：A1 安装/A2 滚动定位/A3 导航刷新/A4 断线续读/A5 装包交验/F4/F5 工作面）；
  4. F8/F9 按 §3 对表单逐格；F10 显式登记延后；
  5. 双尺寸（长短会话）+ 无/过期凭据 fail-closed + 工作区隔离 + A0 对照 3/3（registry 旧制品）；
  6. Node 20 边界腿（§2）PASS；
  7. 全仓回归：AtlasWeb `bun test`（**tests/ 纯面口径**，§5-6）+ AtlasCode 侧不受本波触碰面免跑；
  8. 审批正腿形态：候 §6 呈批裁定——用户批准且切片落地 → pw 审批腿补齐跑全形；否则**受阻登记形**呈报（b12 R2「非静默缺席」先例，单测覆盖 + 结构性不可达说明在案）。
- F4 只据证据裁定；缺任何硬格不给第一波产品通过（主计划原文）。

## §5 审视记录（逐点自决/报裁）

| # | 点 | 裁定 | 依据 |
|---|---|---|---|
| 1 | F6-PAGE UI 消费（load-older 翻页）归属 | **自决：独立 UI 波，不折入 B3** | §M 钉死措辞「后续 UI 波另立工单」——折入须改登记+呈用户敲定，冒销风险面；B0 冻结附表 §4 文件集不含 ConversationView 翻页面，扩格须改冻结合同；判据域不同。UI 波工单由 atlas-mainline-f4 起草案送本侧审视 |
| 2 | workspace 发现列表面归属 | **自决：并轨 B3 波（工单增量①）** | b12 §5 原文预登记「候 B3/接线工单」两可皆合规；判据域 = 执行面接线（R1 形取代）非纯展示 UI；并轨避免 UI 波范围膨胀。**加性扩格显性登记**（附表 §4 文件集 + 发现列表），随工单送审计专核 |
| 3 | runTurn 审批接线切片 | **报裁（候用户，§6 呈批件）** | b12 R2 原文「候呈批」；不阻切片 1–3 先行；终验格 8 预注册两形态候裁 |
| 4 | Node 20 腿形态 | **自决：docker 容器形** | a5 预登记「容器/CI 形均可」；本机 docker daemon 实测 OK |
| 5 | 切片顺序 | **自决：B3 → Node 20+F8/F9 → 总验收链** | 合流 atlas-mainline-f4 排程催单序（两头并进无异议） |
| 6 | 全仓回归扫描面 | **自决：tests/ 纯面口径** | bun test 位置参数=子串过滤器教训（AtlasCode memory bun-test-substring-filter）；呈报计数注明扫描面 |
| 7 | e2e 预跑禁令 | 维持 A-gate 先例 | 不预跑不预占，候审计 PASS 双信号 + Main 候选锁面 |

## §6 呈批件（候用户裁）：runTurn 审批接线切片产品形

- **缺口**（b12 R2 定谳）：`spawnCliTurnRunner` 不消费 `requestApproval`——kernel/host/客户端审批面已落（B2 单测+UI），runner 侧消费接线不在 B2 范围，pw 审批正腿结构性不可达。
- **形 A（推荐）**：runner 收 `requestApproval` → 报 host 审批队列（复用 B2 approvals 证据链七字段/E1–E5 冻结判据）→ UI ApprovalCard → decide → runner 消费决定继续/终止。优点 = B2 面全复用、判据已冻结、审批权威保持服务端。
- **形 B**：引擎侧允许清单预授权（减少运行时审批交互）。缺点 = 审批语义旁路面、与 E4/E5 冻结判据不接、安全面弱于 A。
- **裁点**：① 采 A/B；② 时点——随本收尾波并行落地（终验前）or 终验后另波（终验格 8 走受阻登记形）。
- 约束（B2 既定）：禁复用 CLI control-request 审批面；审批内容不含正文/令牌/待批内容（七字段纪律）。

## §7 信号面

1. 本工单 → Atlas-reveiw 审计（专核点：§5-2 扩格、§4 判据格完整性、§6 呈批框架）；
2. 审计 PASS → 双信号（Main：切片 1 落码 + 候选锁面呈批；e2e：切片 2/4 腿预注册+执行）；
3. §6 呈批件随工单呈用户（裁点②影响终验格 8 形态）；
4. UI 波（§5-1）独立工单另行走审计链，不入本波。
