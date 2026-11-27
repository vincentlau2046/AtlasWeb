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
