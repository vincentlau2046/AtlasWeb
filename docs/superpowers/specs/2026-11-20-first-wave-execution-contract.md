# B0 执行合同：AtlasWeb 第一波真实执行接口协议（候选，未锁定）

**状态（2026-11-20）**：本文是 B0 完整协议候选稿，依据[预盘点](../../2026-11-20-first-wave-b0-preflight.md)（五格 PASS + 两项登记，commit 4cfc2e1）与[第一波方案 §3](2026-11-20-first-wave-product-recovery-design.md) 起草。**未锁定**：须 Atlas-reveiw 独立审计 + AtlasCode Main 确认出口归属后，由 F4 宣布锁定；锁定前不发 B1–B3。未跑真实回合、未写会话、未改产品代码。

## §0 活码锚与不预填纪律

- 事实源：AtlasCode `master` `9697b304`（发布 exports 仅 `./web-contract` 与只读 `./web-session-runtime`；`queryAgentLoop` 为模块导出但**不在发布 exports map = 非受支持 API**）。AtlasWeb `main` `4cfc2e1`。
- 本文锁**要求与可测判据**；受支持出口的具体导出名、包路径与版本号由 AtlasCode Main 在确认归属时定名，本文不预填不存在的路由名，不把内部函数当可用接口。
- 拓扑不变：浏览器/产品服务分进程，产品 host 与 kernel 实例**同进程**（平台设计 :135–150）；本文不引入子进程、远程执行或权限放宽；若实施证明唯有替代拓扑可推进，单列报用户裁定。

## §1 能力与生命周期分离

| 维度 | 只读面（现状，不回退） | 执行面（本文新增） |
|---|---|---|
| 载体 | `./web-session-runtime`，GET 四路由，ambient cookie | 新受支持出口，独立于只读包导出 |
| 授权 | scope 级读授权（一次性打开链接） | **逐工作区显式授权**，由 host 服务端记录；不从读授权推导，不从 `--scope` 自动获得 |
| 生命周期 | host 启动即存在 | 能力默认关闭；`capability.probe` 显式探测；关闭时 UI 不渲染写控件，只读面照常 |
| 失效 | 打开链接过期 → 401 | 工作区授权可独立吊销；吊销即时生效于新命令，运行中回合按 §4 取消规则收口 |

可测判据 E1：无工作区授权时 `turn.submit` 必须被拒且引擎零启动（以引擎侧无回合记录为证，非 UI 提示）；只读四路由行为与 0.1.125 基线逐项一致。

## §2 标识绑定与命令/事件 schema（协议 v0）

传输中立 JSON 信封，经同进程产品适配器（v0）；任何字段不匹配 = fail-closed 拒绝。

```text
Envelope  = { v: 0, id: string, ts: number, type: string,
              bind: { workspaceId, sessionId, turnId? }, payload: object }
Event     = Envelope + { cursor: string }   // 每事件流单调递增；cursor 是事件唯一排序权威
Error     = { code: string, message: string, retryable: boolean }
```

信任级声明（审计登记 a）：`ts` 仅信息性，**绝不参与结算、排序或授权**——排序以 cursor 为唯一权威，身份以 bind 三元组为准，时钟一律服务端。

命令（host 校验 bind 三元组后方可入机）：

| type | payload 关键字段 | 语义 |
|---|---|---|
| `capability.probe` | — | 返回执行能力开/关与受支持 v；仅需连接级鉴权（ambient cookie），泄露面仅 on/off + 受支持 v，不触工作区数据（审计登记 b） |
| `turn.submit` | `submitId`(客户端 UUID), `text` | 提交一轮；幂等键见 §3 |
| `turn.cancel` | `targetTurnId` | 真取消（§4） |
| `queue.remove` | `targetTurnId` | 语义 ≡ `turn.cancel(queued)`：落 `cancelled` 终态（审计必改 1），不静默移除 |
| `approval.decide` | `approvalId`, `decision: approved\|denied` | 唯一有效决定（§5）；bind 须含 turnId 且 ≡ 该 approval.requested 归属 turn（审计必改 2） |
| `follow.resume` | `cursor?` | 执行事件流恢复（§6） |

事件：`turn.accepted / turn.started / turn.delta / turn.completed / turn.failed / turn.cancelled / approval.requested / approval.settled / queue.updated / error`。全部携带与命令相同的 bind 与单调 `cursor`；**结算只认三元组精确匹配**，bind 不匹配的事件一律丢弃并计错误边界；乱序/重复 cursor 按流序锚去重，不按 `ts`。未知 `v` 或 `type` 拒绝并回 `error`。

可测判据 E2：伪造 bind（跨 session/跨 workspace 的事件或结算）必须被丢弃且不产生任何持久化副作用。

## §3 提交幂等

- `turn.submit` 以 `(workspaceId, sessionId, submitId)` 为幂等键；同键重试返回原结算（**accepted / rejected / 终态均算原结算**——审计登记 c：队列满被拒的提交同键重试返回原拒绝，不是二次尝试），**绝不二次执行**。
- 与现 `structuredIO.ts:393–425` 的差别是硬要求：其仅按 requestId 单键去重、无 session 绑定与 actor 审计，**不得**作为本协议的实现替身或结算路径。

可测判据 E3：同 submitId 连发 N 次恰一个回合落盘；不同 submitId 同文本是两个独立回合。

## §4 状态机与真取消

```text
turn:     submitted → queued → running → completed | failed | cancelled   （终态恰一个）
approval: requested → approved | denied | expired | voidedByCancel        （有效决定恰一个）
queue:    每 session 有界 FIFO（默认深度 16，B0 锁定值）
```

- `turn.cancel`：queued → 落终态 `cancelled`（不启动）；`queue.remove` 与之同语义（审计必改 1），不存在无终态的静默移除；running → 触发引擎真中止，终态 `cancelled` 恰一个；已终态 → 边界错误（不改变状态）。
- **断开 ≠ 取消**：连接断开不迁移任何 turn/approval 状态；失联期间的待批操作保持 pending，**绝不自动放行**，按待批超时（默认 300s，锁定值）走 `expired`。
- 取消须以引擎侧证据为准（回合记录中止、待批操作未执行），UI 标签不可替代；关闭浏览器不能伪造取消，重连可查结局。

可测判据 E4：cancel(queued) 后该回合永不启动；cancel(running) 恰一个终态且引擎侧无后续文件副作用；双客户端竞态（一取消一审批）只产出一个一致终态。

## §5 审批决策证据（服务端唯一裁判）

证据记录逐字段锁定（预盘点审计登记已吸收）：

```text
{ workspaceId, sessionId, turnId, approvalId, decision, actorId, timestamp }
```

- `actorId` 由服务端从已认证连接身份解析、`timestamp` 由服务端时钟产生；**客户端自报主体或时间不得覆盖**，携带即拒绝。
- **decide 归属绑定（审计必改 2）**：`approval.decide` 的 bind 必须含 `turnId` 且 ≡ 该 `approval.requested` 事件归属的 turn；同 session 跨 turn 的 decide（旧 turn bind 配新 approvalId 或反向）一律拒绝且零副作用。
- 不记录正文、令牌、待批内容；保留期限 = 与该 turn 记录同生命周期，访问仅经服务端证据查询（bind 限定本 workspace），客户端无写入路径。
- 拒绝/过期/取消/跨域的待批操作**不执行业务动作**；重复决定不产生第二个有效决定；设置不得静默变更批准策略（策略变更须显式受支持设置，B0 只锁默认拒绝）。

可测判据 E5：跨工作区审批被拒且零文件变更；过期/拒绝路径磁盘无痕；同一 approvalId 二次 decide 边界错误；**同 session 跨 turn decide 被拒且零副作用（审计必改 2）**；证据记录可与磁盘实际结果互证。

## §6 刷新恢复与游标

- 执行状态（回合、队列、审批）由内核/host 持久化；浏览器刷新后以持久化回读为准，SSE 仅是视图。
- `follow.resume` 沿用只读面 cursor 语义：按当前订阅代采信事件、断线增量恰一次补齐、过期游标 → 基线替换（不合并旧事件）。cursor 取自事件信封的 `cursor` 字段（§2，事件唯一排序权威）；溢出重同步同样以 cursor 锚定，不按 `ts`。
- 可测判据 E6：刷新后 pending 审批仍在且不丢；断线期间完成的回合与审批重连后各恰好一次可见。

## §7 实例隔离（预盘点登记② → 硬约束）

- **组合根恰一次注入**：产品模式对 `setKernelBootstrapState` / `setSessionEnv` 恰注入一次；**二次注入 = 硬错（非覆盖）**。B0 实现须使现 API 的静默覆盖语义在该模式下不可达（AtlasCode Main 确认：set-once 守卫收敛于 injection.ts 单文件 + 调用点审计 + 判别单测，`resetKernelBootstrapStateForTests` 显式测试缝保留；组合根恰一次须对 `src/atlascode/compose.ts` headless 装配点与 TUI factory 双车道均成立）。
- **单例面穷尽清单（实施波验收件）**：kernel 状态面其余模块级单例的穷尽审计由 AtlasCode 实施波交单，作为 B0 锁定后的验收件之一；清单未交或审计有漏 = 该实施波不收口。
- 同进程双工作区反证：两个独立临时工作区交错执行，各自读写只落对应工作区，会话历史、权限上下文、取消域互不串染（取消甲不伤乙）；禁用改全局 CWD/env 的方式凑隔离。
- 可测判据 E7：上述交错场景全部通过且无静默状态顶替；隔离不成立即 B0 不锁。

## §8 资源上限与边界（锁定默认值）

| 项 | 默认 | 越界行为 |
|---|---|---|
| 每 session 队列深度 | 16 | 拒绝入队，边界错误，不影响运行项 |
| 待批超时 | 300s | `expired`，不执行 |
| 提交载荷 | ≤ 2 MiB | 拒绝 |
| 每 follow 事件缓冲 | 10 000 | 溢出 → 错误边界 + 游标重同步（不静默丢事件） |
| 工作区并发运行回合 | 1 | 其余排队 |

## §9 安装面与放行次序

- 真实回合验收只从**候选安装包**的公开受支持出口启动（A1 入口同一装包）；源码 import、私引上游、解析 CLI 文本、浏览器直写 JSONL 一律不算数。
- 放行次序不变：本文送审 + AtlasCode Main 确认出口归属 → F4 锁定 → B1–B3 按锁定计划实施。若实施发现需放宽权限、变更安全矩阵或替代 F6 原义务，单列报用户裁定，未裁不进 B。

## §10 判别遗留（不阻塞锁定的登记项）

- headless 原语（print.ts:1095–1125/:1202–1224/:1271）可复用的仅是**设计形态**（活权限上下文、回合取消、真权限门委托），实现须落在受支持出口内并满足 §2–§7 全部判据；不得把进程入口、CLI 响应或 requestId 当浏览器会话授权。
- B1 交付时须证「同一候选装包能力关闭 = 纯只读」，防止执行路径残留。
