# AtlasWeb 第一波产品重开 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 本项目已选 **executing-plans，主线程**，实施归 Main；F4/Atlas-reveiw/E2E 按既有跨 session 矩阵，不委派 subagent。

**Goal:** 用户从 npm 安装品打开 AtlasWeb，能够可靠阅读历史并从浏览器完成可控制、可审批、可回读的真实 AtlasCode 任务。

**Architecture:** A 复用同源只读 host、既有壳和 Code bundle，修复分发、导航、滚动、恢复。B 在同一工作面接 AtlasCode 的独立执行能力，授权、队列、审批和日志归内核；不改写只读接口职责。

**Tech Stack:** TypeScript、React/Vite、Bun 构建与单测，Node >=20 发布品启动；Chromium/Playwright 安装品验收、现有 loopback HTTP/SSE 只读合同。

**Spec:** [第一波重开方案](../specs/2026-11-20-first-wave-product-recovery-design.md) 与 AtlasCode `docs/products/atlasweb/2026-11-15-s0-agreement.md` §3.1/§3.2。

## Global Constraints

- A 按 §2 开工条件；B0 可与 A 并行，B1–B3 必须等待 B0 锁定和 A 安装品验收。
- 安装入口为 `atlasweb --scope main=<绝对目录> [--port <端口>]`，仅 `127.0.0.1`，不给浏览器自由传入磁盘路径/切换授权范围；不可把凭据落报告、截图或持久化。
- A 不写真实会话/配置，测试专用临时目录；B 的真实执行验收只允许隔离、明确授权的临时工作区。禁止私引上游源码或复用 CLI 文本作执行协议。
- 已有 F1–F7 不能降格，F6 page 补洞有独立格；F8/F9 交付或显式列差异；F10 可延，Office/Comic 和远程访问不进波。
- `@atlaswork` 面用于本地测试安装。验收用候选 tgz，报告固定 SHA256/SRI 与精确 carrier pin；镜像从同一次 build/staging 派生，仅 package name 不同。下载/安装/产物验证不等于授权 publish；版本与注册表操作由 Main 按授权另走。
- RED 先于变更；产品验收用浏览器操作与真实运行证据，测试数/单屏/HTTP 200 均不可代替。未跑、跳过、无制品锚一律不放行。

## Review Focus

1. 打包命令在无源码、无 Bun 的临时安装环境是否真可运行；无效/已用打开链接是否仍可恢复且不放宽隔离（A1）。
2. 360 条可变高消息首尾可达，字面搜索命中中段；append/re-measure 时锚不漂（A2）。
3. 850px 键盘抽屉、刷新恢复、删除的消息锚、快速切换不被上一会话回包污染（A3）。
4. 断开期间确有新增；游标过期、基线替换及 F6 page 补洞必须分证，不把重复隐藏当正确恢复（A4）。
5. 同一提交重试、取消和审批竞态、跨工作区审批拒绝；必须核内核事件与实际文件结果，不可只看 UI 标签（B0–B3）。

---

## 依赖与当前完成度

`[A0 固定失败证据] → [A1 安装入口] → [A2 阅读定位] → [A3 界面与刷新] → [A4 断线续读] → [A5 装包交验]`。A1/A2 实现无相互依赖，可按顺序减少干扰。`B0 协议和权限审查`从同一开工点并行；`A5 + B0 → B1 → B2 → B3 → 终验`。标记已知旧版实证，不把它勾成新版计划已完成。当前两段均未实施；下文命令涉及新文件，需在对应步骤创建后才能执行。B1–B3 是已定义的产品切片和断言，工程文件/接口签名要用 B0 锁定的补充计划，不冒充可立即开工。

### A0 — 固定对照制品与浏览器验收入口

**文件**：新增 `e2e/playwright.config.ts`、`e2e/fixtures/installedApp.ts`、`e2e/first-wave-readonly.pw.ts`；修改 `package.json`、`bun.lock`（Playwright 仅开发/test runner，`testMatch` 指向 `**/*.pw.ts`，避开 Bun 默认用例发现）。

**接口**：`ATLASWEB_TGZ` 为候选 `@atlaswork` 本地 tgz 的绝对路径。runner 启动独立临时安装目录、临时 HOME/会话根和 Chromium，返回 `{ baseUrl, installVersion, artifactSha256 }`；打开链接在 runner 内消费，不写入控制台/trace/报告。用 `bunx playwright test --config e2e/playwright.config.ts e2e/first-wave-readonly.pw.ts --grep '<测试标题>'` 执行各腿。固定旧版预览另用受控复现程序仅作反例，不作为候选通过的捷径。

- [ ] 从上次复核编入短样本 4 条、长样本 360 条且有唯一 `m001`/`m180`/`m360` 与可变高正文、另一个会话和空库。fixture 只在测试创建的目录追加或替换日志。
- [ ] 复跑并记录 0.1.3 的三个诚实反例：包内无 bin、旧长会话 `m360` 不可达、刷新后 selected 为空。若入口失败，旧版通过明确的源码宿主复现后两腿并打上“对照”标签，候选禁止走这个回退。
- [ ] 核 runner：预检缺失/错 scope 的 tgz 必须非零退出，测试报告包括制品锚和用例结论，不含令牌或宿主真实目录。

### A1 — 已安装软件包的一条启动命令

**文件**：`scripts/build-npm-package.ts`、`packages/web-host/src/launchCli.ts`、`packages/web-host/src/npmEntry.ts`（新）、`packages/web-host/test/{launchCli,npmPackage,staticFace}.test.ts`、`apps/atlasweb/README.md`、A0 spec。安装错误视图接 `apps/atlasweb/src/main.tsx` 与 `packages/web-code/src/views/NavigationColumnView.tsx`（区分兑换失败与会话请求 401）。

**接口（审计定稿：自包含，不走运行时依赖树）**：继续复用 `main(argv: string[]): Promise<void>`。`package.json#bin.atlasweb` 固定 `server/atlasweb.js`（Node shebang）；服务器入口、现有 web-host 和构建时精确锁定的 `@atlasharness/atlascode/web-session-runtime` 一起构建成 Node ESM bundle，非 Node 内建依赖也在 bundle 内。`dist/` 只放浏览器产物，实际静态根固定为 `dist/`，不服出 `server/`。发布 manifest 不声明 npm runtime dependencies；`atlaswebCarrier: { version: string; runtimeSha256: string }` 仅作溯源，取构建时实际载体版本及实际输入的 runtime JS 字节 SHA256，SRI 记同值。双 scope 从同一 staging 产物派生，只改 name。

- [ ] RED `installed bin opens AtlasWeb`：独立临时 HOME 与空 npm 缓存，`npm install --offline --ignore-scripts --no-audit --no-fund <候选 tgz>` 能装，安装目录不在源码仓下、启动 PATH 不含 Bun；在最低支持 Node 20 运行 `.bin/atlasweb`，`await expect(page.getByRole('textbox', { name: 'Search sessions' })).toBeVisible()`。`expired link explains recovery`：`await expect(page.getByRole('alert')).toContainText('atlasweb')`，无授权仍 401。`bad scope fails closed`：非法或缺失 scope 非零退出且无 listener。`packed carrier provenance matches build input`：`npmPackage.test.ts` 验 staging 中 `bin`/`files`、不存在 `dependencies`、载体版本与根/host 双 pin 对表、`runtimeSha256` 与构建读取的实际载体 JS 文件一致；镜像同值，服务器文件不得经静态 HTTP 路径服出。
- [ ] 用上述 Node entry 替代源码依赖启动，保留 loopback/cookie/Host/Origin、退出清理和同源静态规则；不回落源码或安装另一份载体。无效链接渲染重开指引而不是崩空，不自动授权。
- [ ] GREEN：跑三条已装浏览器腿和 `bun test packages/web-host/test/{launchCli,npmPackage,staticFace,security,redeemRoute}.test.ts`；清理前确认进程关闭。版本与新锚归候选阶段，原版锚不抹掉。

### A2 — 让长对话首中尾可读，并定位搜索命中的消息

**文件**：`packages/web-code/src/views/{ConversationView,NavigationColumnView}.tsx`、`packages/web-code/src/views/views.css`、`packages/web-code/src/index.tsx`、`packages/web-code/src/{controller,windowing}.ts`、`packages/web-code/package.json`、`bun.lock`、`packages/web-code/test/views.test.tsx`、`packages/web-code/test/{windowing,controller}.test.ts`、A0 spec。

**接口**：`type OpenTarget = { sessionId: string; messageId?: string }` 由 web-code 导出；`NavigationColumnView` 发 `onOpenSession(target: OpenTarget): void`；Code bundle 调 `controller.openSession(target.sessionId)`，对当前会话的视图传 `targetMessageId?: string`。旧的 controller 读请求签名不改；目标与会话绑定，复用稳定 `data-message-id`。

- [ ] RED `long conversation reaches head and tail`：用真实 wheel/滚动条首尾、实测 `m001` 和 `m360` 的元素与正文 viewport 相交；同一次测试断言 `0 < DOM 消息数 < 360`。`search hit opens exact message`：搜索包含唯一关键字的 `m180`，点击结果，`await expect(page.locator('[data-message-id="m180"][data-search-target]')).toBeInViewport()`。append 在中段阅读时不能拽到底；在尾部时新消息可见。
- [ ] 用可测量可变高度、带总跨度占位的列表替换固定估高切片；`@tanstack/react-virtual` 属于 `docs/t6a-primitives-freeze-list.md` 已有的 **UI 工具链白名单域**，只由 web-code 声明并在依赖清单标明其分域，不属于载体 bump；SSR 原测试不变成唯一凭据。定位包括目标未挂载→滚到索引→测高后对齐；标记不泄露其他会话的命中；如果目标不存在，交由 A3 明示回退。
- [ ] GREEN：跑对应浏览器腿 + `bun test packages/web-code/test/{views,controller,windowing}.test.*`，加运行既有 kernel 边界扫描（`bun scripts/verify-kernel-boundary.ts`）。不要把“挂载数合规”单独当通过。

### A3 — 宽/窄一致的工作面与刷新恢复

**文件**：新增 `packages/web-code/src/readingAnchor.ts`；调整 `packages/web-code/src/index.tsx`、`views/{ConversationView,NavigationColumnView}.tsx`、`views.css`、`packages/web-layout/src/client/AppFrame.tsx`、`apps/atlasweb/src/main.tsx`，补 web-code 测试和 A0 spec。

**接口**：`type ReadingAnchor = { messageId: string; offsetPx: number }`；`readAnchor(storage: Storage, scopeId: string, sessionId: string): ReadingAnchor | null`、`writeAnchor(storage: Storage, scopeId: string, sessionId: string, anchor: ReadingAnchor): void`。键 `atlasweb:anchor:v1:<encoded scopeId>:<encoded sessionId>`；storage 被禁用/畸形条目只降级。URL `?session=<id>` 表示当前选择，读取不等于授权；`messageId` 仍由 A2 视图与会话绑定。

- [ ] RED `narrow sidebar opens by keyboard`：850×800 下 Tab/Enter 打开 `Sessions` 抽屉、搜索可输入、Esc 关闭并把焦点还按钮，1440 宽屏常驻导航。`refresh restores conversation and anchor`：选择长会话并定位 `m180`，刷新后 `m180` 仍在 viewport 且同一会话已选。`missing anchor is explicit`：隔离样本删去已存锚后，不跳其他会话；提示并落到同会话可用位置。`fast switching never restores stale selection`：A 的迟到响应不能覆盖 B。
- [ ] 用布局已有窄窗能力接 Code 导航槽，渲染可用按钮/抽屉而非压扁表单；有会话标题及明确空库、未选中、加载、无匹配、失败态。会话一旦切换即重绑锚，刷新仅在合法同域选择上恢复。正文、搜索文本、凭据不进储存。
- [ ] GREEN：跑四条浏览器腿 + `bun test packages/web-code/test packages/web-layout/test`（新增锚单测覆盖坏 storage 和 scope 隔离）。

### A4 — 断线续读与 F6 验证拆格

**文件**：`packages/web-connection/src/index.ts`、`packages/web-code/src/{controller,projection}.ts`、相应连接/投影测试、A0 spec；若需改变跨仓 F6 合同，先立独立条款而非直接改模式。

**接口**：沿用 `AtlasConnection.follow(sessionId, { scopeId?, resumeCursor? })` 与现有 `AtlasFollowHandle`，按当前 generation 采信事件。UI 状态区分“正在连接 / 在线跟随 / 重连中 / 无法恢复可重试”。

- [ ] RED `disconnect catches up exactly once`：阻断当前 follow，隔离短样本在离线期间追加 `offline-1`、`offline-2`，恢复后两条各一次且顺序正确，旧锚仍在。`expired cursor replaces baseline`：失效后明确恢复，以新基线为准，不把旧消息并入。`unrecoverable connection offers retry`：用尽重试预算后有明确反馈，手动重试不是开第二份活跃 follow。
- [ ] 修现有连接/投影链上确实失败的行为，旧 generation 拒绝、有效 cursor 续接、失效新基线、加载边界与尾部行为保持一致；测试若已绿，只登记实际回归证据，不为了代码提交重写。F6 原 page 补洞另列 `F6-PAGE`：先在锁面明确原缺页场景和期望页边界、对照已有公开接口；若缺接口，登记上游任务和候选放行阻塞，不以新基线取代。A 可做只读演示但不宣布该格通过，第一波产品终验不得跳格。
- [ ] GREEN：浏览器三条 + `bun test packages/web-connection/test packages/web-code/test`，同时记录 `F6-PAGE` 独立结果/缺口及处理人。

### A5 — 只读产品候选交验

- [ ] 显式 pack `@atlaswork` 候选，记录 commit、制品 SHA256/SRI、安装锁定版本；`ATLASWEB_TGZ=<绝对路径> bunx playwright test --config e2e/playwright.config.ts e2e/first-wave-readonly.pw.ts` 完整运行，浏览器资产来自同一包。跑全仓 `bun test`（专用 Playwright spec 由其 runner 执行，不靠用例发现顺序；计划实现中用独立路径/命名配置隔离）。
- [ ] A1–A4 的用户验收项目和只读安全回归全通过才交可安装演示；原 F6 未完成须显式挂账且不给产品总通过。审计/发布链按规则，不从 A 自动推出产品成品或 npm 发布。

### B0 — 执行/权限接口的独立锁面（与 A 同期，不写产品面）

**产出**：`docs/superpowers/specs/2026-11-20-first-wave-execution-contract.md`（待建）与 B 实现附表。以 AtlasCode 已发布导出为事实，检查 `src/cli/print.ts` 现有控制适配和 `src/engine/query/loop.ts` 是否有可复用的 UI 无关闭环；内部函数存在不是已支持 API。先定义最小受支持出口、绑定与隔离，不预设可直接把现有全局入口塞进 host。

- [ ] 锁命令/事件 schema、会话与工作区绑定、提交幂等、回合/队列/审批状态机、实际取消、刷新恢复、权限默认拒绝、输入/排队/事件资源上限与边界错误；逐项给字段/默认/上限/接口签名与跨仓消费点。断网不等于取消；断网失联的待批操作不得被自动放行。产出失效/拒绝路径可测规则。
- [ ] 锁服务端审批证据记录：`workspaceId`, `sessionId`, `turnId`, `approvalId`, `decision`, `actorId`, `timestamp`，主体与时间由服务端给出；只记录必要字段，不含正文、令牌或待批内容。B0 明确保留期限、访问者与失败态；B2 负验字段跨域、过期/拒绝不执行业务动作，重复提交不产生第二个有效决定，客户端自报主体或时间不得覆盖服务端值。
- [ ] 用隔离样本做“执行出口是否可用/是否需上游新发布”的判别，避免产品分支直接私引、共享全局配置或编造原生执行能力；评审有疑点时保持 B 阻塞，不拖住 A。
- [ ] 送 Atlas-reveiw 审 B0；AtlasCode Main 确认范围和出口归属，F4 吸收后定 B1–B3 精确文件、测试命令和顺序。若涉及放宽安全/变更 S0 义务，报用户明确裁定，未裁前不进入 B 实现。

### B1–B3 — 冻结后才能执行的三个产品切片

| 切片 | 交付内容 | 必须先写的 RED / 完成断言 |
|---|---|---|
| B1：授权工作区、真实回合、回读 | 上游执行出口 → 本机 host → 同一会话工作面的输入和流式状态。能新建及继续，能力关闭仍是只读。 | `submit streams and persists a real turn`：浏览器发送→观察引擎同一回合的真实增量→唯一完成→刷新读到该回合；未授权工作区无引擎执行。不得为交付 B1 打开默认跳过权限。 |
| B2：排队、取消、审批 | 同会话有界调度，排队可移除，运行可真正停止；展示并提交批准/拒绝，内核是唯一裁判。 | `queue cancel and approval have kernel effects`：FIFO、重复提交只执行一次、等待取消不启动、运行取消恰一个终态；批准后隔离文件改变，拒绝/过期/跨域无改变；关闭浏览器不能伪造取消，重连可查结局。 |
| B3：产品状态、交付物和设置 | 把真实活动、失败/等待/终态做成可理解面；F4/F5 保留清晰的 Atlas/Code 工作面；F8 交付物、F9 真设置骨架如界定地交付。 | `installed app completes and reopens an isolated coding task`：真实任务更改文件、运行测试、刷新可回读；交付物/设置逐格验，确实不交的按原优先级显式登记差异。镜像安装包保留 A 全链。 |

### 总验收与交接

- [ ] Main 在已授权分支交候选；e2e 独立安装同字节制品跑 A、B 与 F1–F7，F8/F9 对表、F10 登记。双尺寸、无/过期凭据、工作区隔离、旧只读回归都出报告。F4 只据证据裁定；缺任何硬格不给第一波通过。
- [ ] 给用户可亲手走的安装/启动流程与隔离演示工作区。先给 A 候选不意味着 B 完成；版本发布由 Main 按授权另行执行，发布成功不补任何验收缺口。

## 出稿自审（F4）

- §2–§4 映射为安装 A1、滚动与定位 A2、导航与刷新 A3、断连与 F6 A4、A 产物 A5、执行授权 B0–B2、F4/F5/F8/F9 B3/总门；F10 延后显式记录。
- A 的文件责任、入口、命令、用例名、固定数据、消费接口均可点检；A0 接口在后续同名沿用。涉及 B 的协议/具体上限不拿假定补齐；B0 是必要待完成项而非空白通行证。没有 release 许可、开工信号或测试已通过的暗示。
