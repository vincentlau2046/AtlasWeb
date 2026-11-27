# F6-PAGE UI 消费波工单——web-code 分页读取接线（登记面销项）

> 出典：F6-PAGE 销项呈报 §M 钉死措辞「**接口格 + e2e fetch 腿达成；UI 消费登记未销**」+ a5 翻转采记节（AtlasWeb 9e55e5d）「后续 UI 波另立工单」；Atlasweb-F4 收尾审视 §5-1 裁定（2026-11-27）：UI 消费 = 独立 UI 波，不折入 B3，**工单草案归 atlas-mainline-f4 起、送判词侧审视**。本波 = 履行该登记面，a5 格本体已销不受此波影响。

## §0 活码重核（2026-11-27 @ AtlasWeb main e38a9d8 + @atlaswork/atlascode 0.1.128 registry 实发）

- **client 传输面已分页就绪（S2 成果）**：`packages/web-connection/src` `replaySession(sessionId, opts?: { scopeId?; pageSize?; pageToken? })`（:84 接口 / :371 URL 拼接，pageToken encodeURIComponent 原样透传）。
- **host 透传在格（S2 审计 PASS cfee67eb）**：`packages/web-host/src/httpHost.ts:496-510` `?pageToken` opaque 原样（carrier 解码判形）+ `sessionHost.ts:46` 签名加性。
- **carrier 契约在产**：ReplaySessionRequest/Result 分页键 + hasMore/nextPageToken（@atlaswork/atlascode 0.1.128 registry 实发，runtime index.js `85e9b293…` = SRI v0.1.128 逐字；S3 39/39×3 + L6 registry 重跑 39/39 全绿）。
- **消费缺口实勘（本波靶面）**：`packages/web-code/src/controller.ts:215` `await this.connection.replaySession(sessionId)` **零分页参 = 全量路径**；`packages/web-code/src/views/ConversationView.tsx` 零 loadOlder/翻页面；全 web-code `load-older|loadOlder|pageToken|nextPageToken` 消费侧 grep 零命中。
- **超帽现行为（a5 用户价值缺口）**：全量超帽 → carrier 429 resourceLimit（G7 直证：5.73MiB 种子全量 429 / 分页可达）→ `controller.ts:217-221` catch → **error 态，会话不可读**。a5 格原义「超帽内容不再不可达」接口层已达成、UI 层未兑现。
- **冻结面**：B0 冻结附表 §4 文件集不含 ConversationView 翻页面（F4 §5-1 依据）= 本波为真新波，非收尾波扩格。

## §1 格与范围

- **格**：web-code 消费接线——① controller 分页装载（超帽回退分页读）② ConversationView 历史行进面（进度/更早历史 + cursorExpired 显性处理）。
- **非目标（防扩格）**：TUI 侧消费（TUI 非 carrier 客户端，本地直读不属此接口域）；list 面会话分页（F6-PAGE §M 登记候选维持不并入）；carrier 契约变更（加性零破冻结面，含尾锚 token——见 §5 自决 3）；web-host/web-connection 协议改动（传输面已就绪只接不改）。

## §2 判据格（预注册，RED 先行）

1. **超帽可读**：种子 >4MiB 投影会话打开 → 非 error 态；分页行进装载全部历史后 follow 正常接管（a5 用户价值 UI 层直证；复用 S3 G7 同族种子 >4MiB）。
2. **帽内零变更**：帽内会话打开路径行为不变（全量首试默认保留）——零回归格。
3. **无重无漏**：分页行进集 ≡ 期望全集——**帽内族**（≤4MiB）恒等参照 = 全量投影（S3 G2 判据形，long/compact/snip 三族）；**超帽族**（>4MiB）全量读不可用（G7 直证），恒等参照 = **种子构造已知集**（fixture 内容 by construction），非「对照全量读」（审视修形 a）。
4. **cursorExpired 显性**：行进中 compact/rewrite 发生（cursorExpired）→ UI 显性处理（换基线重载或提示），禁静默丢内容（S1 token 三态语义 UI 映射）。**F2 族显性登记（审计注记 1）**：单记录独超页帽（S3 G8 F2 形 4.5MiB 单记录）在分页路径仍 429 = resourceLimit **显性 error**（明示原因、不静默不截断，跨页错误非短页）——该族不可达为既有语义**非本波缺口**，UI 实现禁误吞/误截。
5. **follow 并存不乱序**：follow 事件收敛与分页历史行进并存——追加不与未行进历史段交错乱序（generation 守卫 + 序数序）。
6. **传输面零改动**：web-connection/web-host/**apps/atlasweb** diff 零（只接不改格；web-code only 边界机器可判——diff 直判；审计注记 2）。
7. **词表红线**：安装品词表扫描零命中（既有执法随动）。
8. **回归链**：A 链只读全回归不退——腿数按 b12 协议注记形校准 = `--grep-invert "\[对照\]"` 全文件实数 **18 腿**（「13 腿」系 A-gate 时点形，防跑漏；审视修形 b）+ 全仓 bun test 0 fail（tests/ 纯面口径）。

## §3 修形定形（落码归 Main，本工单只定形）

- `controller.openSession`：全量首试 → 429 资源帽 → **分页模式**（page 1 起行进装载 + 进度面）→ 行进完 follow 接管；帽内路径不动。
- 状态机加性：`replay` →（超帽）`paging-walk` 新中间态 → `live`；既有 error/closed 终态语义不变。
- `ConversationView`：行进进度面（「加载更早历史…」）+ cursorExpired 显性提示/重载入口。
- `modelFromProjection` 增量 merge 形（分页结果并入模型，不重灌）。

## §4 信号面

工单（本档，审视判词 PASS @ 折入版）→ Atlas-reveiw 审计 → PASS 双信号（Main 落码 / e2e 判据）。**时点：第一波收尾波（B3 → Node20+F8/F9 → 总验收链）之后排入**（§5 自决 4）——总验收链不受扰 + 本波零 carrier 触碰无需发布链。**前提锚登记（审计注记 3；2026-11-27 Main 回填兑现）**：开工前提 = 收尾波收口后 pin 现状锁定；审批接线 carrier 分支**增补支成立**（0.1.129 段 L 形已发布），pin bump 已落（84b194e）——本波在 **0.1.129 pin** 上开工。**SRI 锚值（回填）**：载体三值 = cli.js `62bbc6cf…` / runtime `85e9b293…` / execution `921d0ab7…`（f4 备档，Main 本机 node_modules 直证全等，全值见 `docs/sri/v0.1.3-final-candidate.md` 载体三值行）；判据格 1/3/4 锚按 0.1.129 pin 版制品复证，零返工面。

## §5 审视记录（f4 逐点，2026-11-27）

- **自决 1（范围）**：web-code only——依据：消费缺口实勘（§0）+ 接口域（carrier/web 客户端）+ §M 登记面；TUI/list 面排除。
- **自决 2（帽内零变更）**：全量首试默认保留，分页仅超帽回退——最小格面纪律 + 判据格 2 零回归锚。
- **自决 3（超帽初屏 = 起点行进）**：page 1 起顺序行进，不做 carrier 尾锚 token——尾锚 = carrier 契约新增（AtlasCode 侧出码），出本波范围，登记候选（若行进体验不足后续另立）；行进期间进度面可接受。
- **自决 4（时点，原报裁 1 经审视转自决采认）**：**收尾波后**排入——波序裁定同类先例 = 收尾工单 §5-5（审计已采认）；理由 = 总验收候选确定性 + 本波零 carrier 触碰无需发布链，收尾后插入最净。用户另有意向可翻（判据格预注册不受时点影响）。
- **裁定 2（已裁，原报裁 2）**：runTurn 审批接线形态 = **用户 2026-11-27 亲裁：形 A（runner 调 kernel 供给的 requestApproval——host approvals 仅证据落档、decide 经 kernel，防 host 直通旁路；复用 B2 approvals 证据链/E1–E5 冻结判据）+ 随收尾波并行落地**——收尾工单 §6 @42c5251 落档、权威路径校正采记 @22216c4 在案（含 carrier 分支定谳件：0.1.128 stream-json 已含结构化审批事件形则零 carrier 触碰，否则 carrier 增补走段 L 形链候亲署 + 终验候选重出）。本波独立件零耦合维持；届时消费形 A 已落地面（审批队列 UI ApprovalCard 在产）。

## §6 验收件

RED→GREEN 判定单（e2e）+ 审计 PASS + 超帽种子实装腿（G7 同族）+ 回归链绿面 + 登记面销项注记（F6-PAGE UI 消费行翻转候本波收口，措辞届时钉）。

## §7 审计采记（Atlasweb-F4，2026-11-27）

- **审计终判 @1bd3bf6：PASS（0 必改）+ 3 非阻注记**——四专核逐项成立（活码四点复证含同 grep 复跑零命中 / 八格全数有出处无冒格〔格 3 修形 a 判「去冒」〕/ 非目标边界守住 / 时点自决有先例且与收尾波串行无扰）；复判 4 注记处置 @22216c4 同批核真闭环。
- **3 注记处置（本 commit 折入）**：注记 1 → 格 4 F2 族显性登记；注记 2 → 格 6 补 apps/atlasweb 零 diff；注记 3 → §4 前提锚登记。
- **双信号**：Main 落码 §3 三件 / e2e 判据 §2 八格+验收件 §6——已发登记，**执行候收尾波收口**（时点自决采认形）；登记面销项注记（§6 末句）采认。

## §8 GREEN 轮裁定（f4，2026-11-27；判定单 `user-e2e/reports/r-20261127-f6page-ui-green.md`）

- **判定单采认：GREEN 轮不通过维持（不冒绿）**——七格绿面（格 2/3/4/6/7 GREEN + 格 5 序面 GREEN + 格 8 绿面：pw 18/22 + viewport 4 红既登记零新增 + bun 561/1skip/0 fail）+ 格 1 单红钉格（半销形）。D1 = 锚 #2 ab8af94a/5c685cfe 判前判后 MATCH。
- **销面采认（020f3cb 客户端修复 wire 直证）**：超帽分页行进全链（progress face + page1=27/page2=13 + 行进集 union 40/40 noDup）/ F2 显性跨页（error 面 + 4 条零误吞）/ cursorExpired 真构造捕获（截断竞态 → Reload → 重行进 live 30/30 恒序）/ 帽内全路径零回归（RED 基线逐字段恒等）。
- **格 1 未销面定性（裁定）**：服务端 **follow baseline 投影限**（follow SSE 首帧流内 `{kind:"error",code:"resourceLimit",message:"projection exceeds limit (6004528 bytes)"}` + closed，HTTP 200 SSE 形非 429 形，追加前后确定性同形）= **新暴露 pre-existing 产品缺陷**（web-session-runtime 域，020f3cb §3 三件之外；unpack diff 仅 client bundle → server 字节恒等直证；旧码死于 replay 层从未达 follow，客户端修复揭开既有面）→ 属格 1 预注册判据面（follow 正常接管）→ **修形切片入本波（非另立波）**——另立波则格 1 无限期悬挂，预注册判据面不外移。
- **切片程序（波内增量节）**：Main 出 follow baseline 根修切片方案（修向候选对表——基线 cursor 化 ∥ 限额策略 ∥ 降级路径——+ 技术裁定 + §0 活码重核）→ Atlasweb-F4 审视 + Atlas-reveiw 审计双门 → 落码。**升级条件：若方案涉 follow 架构语义级重构（超出基线投影策略修复面）→ 呈用户敲定（卷 4 级规则）**。
- **合流排程（双轨并行，f4 排程权）**：
  - **轨 A（即时）**：viewport 根修 @9b28206 候件条件已满足（GREEN 判定单已出，无在途 ×3 轮，跨测试文件变更防面解除）→ Main 合 main + push；**test-side-only 零打包面 → 锚 #2 不重出，重建核验字节恒等即直证**（SRI 锚 #2 节补构建源推进登记行）；e2e 根修验收轮即刻（§6 六格 ×3 + 断言零改动审计；canon 名冻结副本 + `--config e2e/playwright.config.ts` 两教训随信号）。根修收口 = 第一波 §7-11 格 1 豁免销项。
  - **轨 B（并行）**：follow 切片方案双门 → 落码合并 → **锚 #3 重出**（server 字节变）→ 本波 GREEN 复判（e2e v3 腿基座就绪复判成本低；格 8 22/22 应全绿——viewport 四红腿已由轨 A 转绿 + follow 销）→ 本波收口 + F6-PAGE 登记行翻转注记（§6 末句兑现）。
- **登记面处置**：① 超帽 follow 流内错形适配器终态处理不重连、UI 无从与 replay 429 区分 → **挂账池**（error 呈现区分度，非本波阻面）；② #282 viewport 波判读合流时点 → 本裁定双轨即协调（rootfix 判定锚 = 锚 #2 恒等核验面；本波复判锚 = 锚 #3）。

## §8-1 勘正（f4，2026-11-27；e2e 补充信号 + 判词侧 Atlasweb-F4 抽核，f4 活码直证 MATCH）

- **格 1 修向域更正**：§8「web-session-runtime 域」不确 → **AtlasCode 引擎侧 session runtime**——错误帧串「projection exceeds limit (6004528 bytes)」与 `src/atlascode/web/follow.ts:371-375`（issueBaseline：buildProjection → serializedProjectionBytes > limits.maxProjectionBytes → setTerminal resourceLimit）逐字吻合 + `:510` emitReplacement 同限 + 帽源 `src/atlascode/web/limits.ts`（零隐式截断纪律在档）；f4 活码直证 MATCH（判定单 §3 勘正注记已折入，e2e + 判词侧同证）。**§8 其余裁定面不变**（切片入本波、双门程序、双轨排程、登记面①②）。
- **轨 B 修订（域更正后果）**：follow baseline 根修切片 = **AtlasCode 域切片**——Main 出 AtlasCode 侧切片方案（follow baseline 分页/增量形 + limits 帽策略候选对表 + §0 活码重核）→ 双门（Atlasweb-F4 审视 + Atlas-reveiw 审计）→ AtlasCode 落码 → **carrier 候 0.1.130 走段 L 形发布链：L4 用户亲署候件（0.1.129 预授权不外溢新版本号，届时呈请）** → AtlasWeb pin bump + 确定性重建 → **锚 #3 重出**（bundle 字节变）→ GREEN 复判（e2e v3 腿基座）→ 本波收口 + F6-PAGE 登记行翻转注记。
- **并池记账采认（判词侧建议）**：fail-closed 张力面家族并池——① 超帽 follow HTTP 200 流内错形（适配器终态处理不重连，UI 无从与 replay 429 区分）② `--workspace` 目录缺席静默接受——同族记账，加固裁量并池处理。
- 轨 A 不变：viewport 根修 @9b28206 即刻合并（test-side-only → 锚 #2 不重出，重建核验字节恒等直证）→ e2e 根修验收轮即刻。
