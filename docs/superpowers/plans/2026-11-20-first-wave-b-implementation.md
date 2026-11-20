# AtlasWeb 第一波 B 段实现附表（B1–B3，依据已锁定 B0 合同）

> **For agentic workers:** 附属于[第一波实施计划](2026-11-20-first-wave-product-recovery.md)（A0–A5 为主计划）；执行方式同主计划（executing-plans，主线程，实施归 Main；不委派 subagent）。

**状态（2026-11-20）**：B0 合同已锁定（[执行合同](../specs/2026-11-20-first-wave-execution-contract.md) @ de2a9e8，审计全链 562b5cb→4cfc2e1→b047a4f→7cf9920→de2a9e8）。本附表按主计划 B0 条款冻结 B1–B3 的工程文件、接口签名、测试与顺序。**B1 落码开工前提 = 本附表审计闭环 + A5 候选验收通过**（主计划依赖行 `A5 + B0 → B1`）；本附表成文未实施、未跑真实回合、未写会话。

## 全局约束（继承主计划，B 段追加）

- 执行能力默认关闭（合同 §1/E1）；UI 无写控件当 probe=off。AtlasWeb 侧永不直写 JSONL、不解析 CLI 文本、不私引源码；一切执行经受支持出口。
- AtlasCode 执行出口的导出名/包路径/版本由 Main 定名后回填本附表 §0 锚表；回填前 `packages/web-host/src/execution/upstream.ts` 是唯一接触点，其余文件不得 import 具体导出名。
- 审批证据生产者 = AtlasWeb host `approvals.ts`——合同 §5「服务端」在本拓扑的落点（浏览器连接终结在 host，kernel 不可见浏览器身份）。`web-code` UI/客户端层**不自造不覆盖**，`actorId` 展示值取自 `approval.settled` 事件；`approvals.ts` 是**纯证据落档件，不自建裁判**（状态机/待批超时归上游 kernel，300s 上游计时不变），证据记录须与 kernel 决策结果可互证（E5 互证腿保留）。（审计必改：生产者角色钉死）
- B 验收一律在隔离临时工作区做真实引擎回合；`@atlaswork` 面装候选包；截图/HTTP 200/测试数不可替代。

## §0 回填锚表（Main 定名后由 F4 填写，逐项带 commit）

| 锚 | 值 | 来源 |
|---|---|---|
| 执行出口导出名 | 待 Main 定名 | AtlasCode 实施波 lock-face |
| 执行出口包路径 | 待定名 | 同上 |
| 首个承载版本 | 待排波 | 同上 |
| set-once 守卫实码 commit 锚 | 待落码 | 锁定登记挂账① |
| 单例面穷尽清单 | 待交 | 实施波验收件② |

## §1 共享地基（随 B1 首切片落，不单独成段）

**文件**：新增 `packages/web-host/src/execution/upstream.ts`、`executionRoutes.ts`、`workspaceAuth.ts`；修改 `packages/web-host/src/launchCli.ts`（装配执行能力，默认 off）、HTTP 路由分派；新增 `packages/web-host/test/execution{Routes,WorkspaceAuth,Upstream}.test.ts`。

**接口（AtlasWeb 侧唯一内部契约，后续切片沿用）**：

```text
upstream.ts   : ExecutionUpstream — 对受支持出口的薄适配；方法 = 合同 §2 六命令一一对应；
                事件信封（含 cursor/bind）原样上抛，不重写排序、不改结算。
workspaceAuth : grantWorkspace(workspaceId, dir) / revoke / isGranted — 服务端落档，
                不从 --scope 读授权推导（合同 §1）。
executionRoutes: POST 路由挂 auth fence 之后；bind 三元组 host 侧先校验再入 upstream（E2）。
```

- [ ] RED：probe=off 时 POST 全 404/403 且引擎零启动（E1 腿）；bind 不匹配事件被丢弃计错误边界（E2 腿）；重复注入 workspaceAuth/upstream 构造即硬错（§7 组合根恰一次的 AtlasWeb 侧对表腿）。
- [ ] 合同 §8 上限（队列 16 / 2 MiB / 缓冲 10 000 / 并发 1）随状态机归**上游执法**；AtlasWeb 零重复执法，仅呈现边界错误码。GREEN 增自动执法腿：除 `upstream.ts` 外全仓零执行出口 import 扫描（与 kernel 边界扫描同法），单接触点纪律可机器判而非靠自觉。（审计登记 c）
- [ ] 静态根 `dist/` 不新增任何执行面资源；server 代码不经静态 HTTP 服出（A1 既有规则回归腿）。

## §2 B1 — 授权工作区、真实回合、回读

**文件**：新增 `packages/web-code/src/execution/executionController.ts`、`packages/web-code/src/views/Composer.tsx`；修改 `apps/atlasweb/src/main.tsx`（probe 后挂载写控件）、`packages/web-code/src/index.tsx`、`packages/web-code/src/controller.ts`（只读 API 不改签名，新增执行通道挂点）；新增 `packages/web-code/test/execution*.test.tsx`；新增 `e2e/first-wave-execution.pw.ts`（testMatch 沿用 `**/*.pw.ts`）。

**接口**：`executionController.submit(text): { submitId }`（`crypto.randomUUID`，幂等键客户端产一次、重试复用）；`executionController.follow(): EventHandle`（cursor 续传，复用 §6 语义）；`Composer` 仅在 `capability.probe` = on 且当前 scope 已授权时渲染，否则零渲染（不是 disabled 占位）。

- [ ] RED `submit streams and persists a real turn`：隔离临时工作区授权后，浏览器发送 → 观察引擎同回合真实增量（`turn.started`→`turn.delta`→恰一个终态）→ 刷新后回读到该回合（E6 腿）。断言含「同 submitId 重试不产生第二回合」（E3）。
- [ ] RED `unauthorized workspace never executes`：未授权 scope 提交被拒且引擎侧无回合记录（E1 全腿，以内核证据为准非 UI）。
- [ ] 实现：host 把 `turn.submit` 经 upstream 转受支持出口；`turn.*` 事件按 bind 精确投递到对应会话视图；终态持久化回读沿只读 replay 面。能力关闭 = 纯只读回归腿（合同 §10）。
- [ ] GREEN：`bun test packages/web-host/test packages/web-code/test` + `bunx playwright test --config e2e/playwright.config.ts e2e/first-wave-execution.pw.ts --grep 'submit streams|unauthorized workspace'`。

## §3 B2 — 排队、取消、审批

**文件**：新增 `packages/web-host/src/execution/{queue,approvals}.ts`（approvals = 纯证据落档件，见全局约束生产者角色钉死：七字段、actor/time 由 host 从已认证连接身份/服务端时钟产、不含正文/令牌/待批内容、保留=turn 同生命周期、仅服务端证据查询可读、与 kernel 决策结果可互证）；新增 `packages/web-code/src/views/{QueueList,ApprovalCard}.tsx`；修改 `executionController.ts`（cancel/remove/decide 三命令）、`Composer.tsx`（排队区/待批卡挂载）；对应 host/web-code 测试与 e2e 腿。

**接口**：`queue.remove(turnId)` 走合同 `cancelled` 终态语义（不静默移除）；`approval.decide(approvalId, decision)` bind 必含 turnId 且 ≡ 归属 turn（必改②）；待批超时由上游服务端计时（默认 300s），AtlasWeb 只展示 `expired`。

- [ ] RED `queue cancel and approval have kernel effects`：FIFO 入队、重复提交只执行一次、等待取消不启动、运行取消恰一个终态；**双客户端竞态（一取消一审批）只产出一个一致终态（E4，审计登记 a）**；批准后隔离文件实际改变、拒绝/过期/跨域零改变（磁盘证据）；关闭浏览器不伪造取消，重连查结局（E4/E5 全腿）。
- [ ] RED `decide binding is turn-exact`：同 session 跨 turn decide 被拒且零副作用（E5 新腿）。
- [ ] RED `execution stream reconnects exactly once`：断线期间完成的回合与审批，重连后各恰好一次可见（执行流侧 E6 腿，cursor 语义复用 A4 形态；审计登记 b）。
- [ ] 实现：queue/approval 状态机在上游内核（AtlasWeb 不自建裁判）；UI 状态只读投影 + 命令发送；`actorId` 展示值取自 `approval.settled` 事件，不本地推断。
- [ ] GREEN：单测同 §2 + `--grep 'queue cancel|decide binding'`。

## §4 B3 — 产品状态、交付物与设置

**文件**：新增 `packages/web-code/src/views/{DeliverablesCard,StatusStrip}.tsx`、`packages/web-code/src/settings/settingsPanel.tsx`；修改 `AppFrame` 挂载、main.tsx；对应测试与 e2e 腿。

- [ ] RED `installed app completes and reopens an isolated coding task`：真实任务改文件、跑测试、刷新回读全程；交付物卡（F8）基于内核真实输出，无内核交付面则显式登记差异不造假；设置面板（F9）只展示受支持设置有效值，无空壳开关；F4/F5 保持清晰 Atlas/Code 工作面。
- [ ] GREEN：单测 + `--grep 'completes and reopens'`；镜像安装包保留 A 全链回归腿。

## §5 顺序与门

`§1 地基 + B1 → B2 → B3`；每切片门 = 对应浏览器腿 + 单测 + 只读全回归（A 链 e2e 重跑不退）。终验按主计划「总验收与交接」：e2e 独立安装同字节制品跑 A+B 与 F1–F7 对表，F8/F9 逐格验或显式登记，F10 登记延后。缺任何硬格不给第一波产品通过；版本/发布由 Main 按授权另走。

## §6 出稿自审（F4）

- 合同 E1–E7 逐条映射：E1→§1 RED+B1 unauthorized 腿；E2→§1 bind 腿；E3→B1 幂等断言；E4/E5→B2 全腿；E6→B1 刷新腿；E7→§1 组合根对表腿 + 上游实施波验收件（不在 AtlasWeb 侧冒领）。
- 未预填 AtlasCode 侧任何导出名/路由名；upstream.ts 单接触点纪律使定名回填收敛为一文件。
- 未宣称任何已实施/已测试状态；B1 开工双前提（附表审计 + A5 验收）未闭合。
