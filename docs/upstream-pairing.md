# Upstream pairing record

AtlasWeb ↔ AtlasCode pairing facts for G1 consumption. Immutable per row;
new pairings append new rows. Sources: upstream S0 delivery ticket
`AtlasCode docs/2026-11-15-atlasweb-s0-upstream-delivery-ticket.md` (§5.15 G1
final verdict @730e735a), SRI `AtlasCode docs/sri/v0.1.115.md` / `v0.1.116.md`,
gate/prodlane reports `r-20261115-gate-s0ur.md` / `r-20261115-prodlane-115-116.md`.

## Pairing 1 — S0 G1 consumption baseline (2026-11-15)

| Field | Value |
|---|---|
| Upstream source anchor | `mainline master 730e735a` |
| Upstream releases | `c8d8be47` (v0.1.115) / `59324b86` (v0.1.116), tags v0.1.115/v0.1.116 |
| Consumed package | `@atlasharness/atlascode@0.1.116` (exact-pinned in root `package.json`) |
| npm dist.shasum | `02184aeded67ded8bdf34b0c3ca850626caa8b8e` |
| npm dist.integrity | `sha512-uhsYoTsXm9eC3huHdCkx+oMewwogRuSug6DJzJwi00IeOGVbmjINruoukCIjapCK6UCmHLppBW9cZzhy2JmFXA==` |
| `./web-contract` | since v0.1.115, browser ESM, zod-only; 7,975B (verified installed bytes) |
| `./web-session-runtime` | since v0.1.116, Node>=20 ESM; 38,652B (verified installed bytes) |
| `bin` behavior | unchanged; installed `cli.js` sha256 prefix `282b0085` (verified, matches upstream double-version identity) |
| Install discipline | npm registry install only; npm link and source-path joins forbidden |
| Smoke result | pre-start reject (`closed`), listSessions OK, cross-scope `scopeDenied`, close idempotent, epoch issued, real HOME untouched |

## Known G1-consumption gap (registered)

**RESOLVED 2026-11-16 — see Pairing 2.** Original registration: engine body
lived outside the pack; real-data four-face verification was blocked on the
carrier. Never hand-copied; upstream S0-R2 ticket delivered the supported
carrier.

## Pairing 2 — S0-R2 form A engine carrier (2026-11-16)

| Field | Value |
|---|---|
| Upstream release | `@atlasharness/atlascode@0.1.117` (npm latest; shasum `3e591f9f…`, integrity `sha512-DjsGgnSx…`, upstream SRI `docs/sri/v0.1.117.md` four-point MATCH) |
| Chain | lock-face @25cb7454 → f4 批复 @351c74c4 → 段 I ca761a91 → GATE-PASS r-20261116-gate-s0r2 → f4 采认 @8ef0d74e/§9 @dfda805c → 0.1.117 release → 生产 PASS r-20261116-prodlane-117 |
| New export (form A) | `createDefaultReadonlySessionRuntime` + `AtlasWebSessionRuntimeOptions` on `./web-session-runtime`; engine real body ships in bundle; injection seam retained |
| Verified installed | `cli.js` 18,212,217B / sha256 `8abf44dd…a355855c` (Δ+237B pre-registered); `web-contract` 7,975B identical; `web-session-runtime` 38,652B → 67,094B |
| Consumer smoke | default carrier: list + real projection replay on seeded transcript — `semantics: "persisted-effective-conversation"` per S0 agreement §3; close idempotent; real HOME untouched |
| Host integration | `engine` option now optional (default carrier); explicit injection seam kept for tests; `replaySession` delegate added; lifecycle race fix (close-wins) retained; full suite 8 pass / 0 fail |
| Package-manager discipline | npm-only lockfile (bun.lock removed); bun = test runner only |

## Pairing 3 — S0-R3 security hardening carrier (2026-11-16)

| Field | Value |
|---|---|
| Upstream release | `@atlasharness/atlascode@0.1.118` (npm latest; release `363207ff`, tag v0.1.118 origin+gitcode; master `45269516` ALIGNED; SRI `docs/sri/v0.1.118.md`) |
| Verified installed | `cli.js` 18,214,475B / sha256 `133f279a…de8cb089` (gate pre-registered anchor three-way identity) |
| Chain | PR #1 (branch `s0-r3-security-hardening`, consumer-side direct implementation per owner directive) → f4 §9 采认 @639b23f1 → Atlas-reveiw §10 @62f69948 → header fix `720e2b95` → e2e gate 格 1-5 GREEN → merge → 0.1.118 → 生产 lane PASS |
| Findings ①②③ | all closed: cycle → bounded gap-null (resolve visited Set); TOCTOU → fd chain (opts-presence arm, four points single-fd, post-read ino/size verify) + handoff-window double-sampling overlay retained; pre-parse bound → additive maxBytes + TranscriptTooLargeError (sanitized) → resourceLimit mapping |
| Consumer legs | `packages/web-host/test/s0r3-regression.test.ts`: ① oversized → `resourceLimit` sanitized; ② cyclic chain → bounded gap-null (chain roots at survivor; zero hang); ③ ABA window → `ioUnavailable` retryable (handoff double-sampling). Full suite 17 pass / 0 fail |
| Mitigation truth form | 「fd 链（函数内四点）+ 交接窗双采样守卫（叠加纵深）」 per f4 §7-3 终裁 |

## Pairing 3 addendum — G2 consumer legs on 0.1.118 (2026-11-16)

| Item | State |
|---|---|
| 格 F dual-instance isolation | GREEN @`b1368eb` — same-process two runtimes, distinct scope domains / same sessionId interleaved list+replay zero cross-domain (incl. reverse `scopeDenied` legs), A increment not in B, close-A spares-B, epochs distinct, close idempotent, zero global env/chdir |
| 格 D+H follow face | GREEN @`659011f` — `SessionHost.followSession` delegate + HTTP SSE bridge (`GET /sessions/:id/follow`): WebSessionEvent v0 frames, `closed` unique terminal, append → replacement convergence verified, client disconnect frees subscription slot |
| follow missing-session ruling | in-stream `error{notFound}` → `closed` pair per upstream contract (404 pre-stream mapping stays request/response-faces only; pre-stream check would need extra scope scan + TOCTOU window) |
| 格 D search face | **UPSTREAM GAP registered** (signal to atlas-mainline-f4 2026-11-16): `ReadonlySessionRuntime` exposes list/replay/follow only; contract schema `SearchSessionsRequestSchema` exists but no runtime implementation. AtlasWeb does not hand-copy projection-search semantics (`renderableSearchText` engine domain) and will not ship a title-filter stand-in. **Upstream confirmed & filed**: registration doc `docs/2026-11-16-s0-r4-searchsessions-registration.md` @`bcd47495` (upstream master); queued as S0-R4 = 0.1.119 候 (merged-candidate with §11 F1/F2, single lock-face, decision at wave start). Consumer legs staged, awaiting upstream landing → anchor upgrade + 格 D search legs |
| Suite | 24 pass / 0 fail (8 files) |
| Commit security review ①② (2026-11-16) | both fixed @`986d206`; follow-up (slow-consumer termination) @`6d22e2c`: timeout path now `res.destroy()` + socket teardown (graceful end waits on flush forever under zero-window client); `followSlowConsumerMs` option (default 30s); transport-level leg = raw zero-read TCP client → `server.getConnections()` → 0 after deadline. Probe (dual-runtime): RST not event-visible to zero-read peer — server-side connection count is the portable discriminator (destroy → 0 on bun+node; graceful end → pinned at 1 = RED shape) |

## Pairing 4 — S0-R4 searchSessions + F1/F2 defense-in-depth (2026-11-16)

| Field | Value |
|---|---|
| Upstream release | `@atlasharness/atlascode@0.1.119` (npm latest; release `442f8eae`, tag v0.1.119; SRI `docs/sri/v0.1.119.md`; npm dist.integrity `sha512-ggYbm6tc…FWqajFQ==` full-value identical to SRI) |
| Verified installed | `cli.js` 18,215,220B / sha256 `f4b1e4d0…f3bee8` (SRI = gate 预注册锚 = installed 三点恒等); `web-contract` 7,975B (七版恒等); `web-session-runtime/index.js` 78,031B (Δ+8,168B, search 域真体随形 A 载体) |
| New face (S0-R4 件 A) | `searchSessions(req, signal)` — query 界 1–256 code points（契约面，host 预验 fail-closed 400 invalidRequest）；snippet ≤512 cps 命中起点切片；`nextPageToken` = opaque offset cursor（会话边界粒度，mtime 漂移容忍=越界空页）；取消语义 A 形（AbortSignal，'cancelled' 零 partial payload） |
| Defense-in-depth | F1（O_NOFOLLOW + expectIno 复用域）+ F2（位置化分块读）随波落地 |
| Consumer legs | `packages/web-host/test/searchFace.test.ts`: 真实投影命中（snippet ≤512）/ 零命中≠伪空 / query 界 400 / scopeDenied 403 / 401 / 委派 closed/not-started 守卫。格 D 四面齐 |
| Gate truth table | `face-search` 翻绿；G2 余 `pairing-rollback-live`（格 I，待授权）单缺口 |
| Chain | 登记档 @bcd47495 → 全工单 f0c4d19a → 审计 §6 @51c05fbd → lock-face §10 @7ecf0fa4 → 段 I d00cc534 → GATE-PASS @944fc3e5 → §11 采认 97f52c6f → release 442f8eae → 生产 lane PASS（r-20261116-prodlane-119） |

## Upstream registration — S0-R5 follow-recovery pair (2026-11-16)

e2e P1 probe findings ②③ registered upstream; f4 confirmed both @`2ef06607`
(mechanism fully adopted), queued as **S0-R5 = 0.1.121 候** (after 0.1.120,
single lock-face):

| # | Gap | Upstream verdict | Candidate shape |
|---|---|---|---|
| ② | rewrite-larger → `corruptData` hard terminal (should be `resetRequired`) | `follow.ts:420` guard `ino!==anchor \|\| size<offset` misses same-inode size>offset face | discontinuity-detection widening (3-way 呈批) + subscription-window shape folded in + corruptData narrowed to true corruption |
| ③ | `resumeCursor` contract-present/implementation-absent | sole presence = contract schema :87, zero wiring | `cursorExpired` 分态兑现 + ledger 对表 |

Gate includes consumer probe-matrix 5-leg rerun (smaller/larger/in-window/
cursor-expired/cursor-valid). Consumer `?cursor=` passthrough seam @`71c2208`
becomes live on upstream landing.

## Security review findings gating real-data G2 — CLOSED (2026-11-16)

All three findings closed by upstream 0.1.118 (Pairing 3); consumer legs
green. Note per f4 工单 §11 @f8233930: two defense-in-depth candidates from
the 0.1.118 push auto-review (F1 symlink authorization-anchor gap / F2
authorization-arm bounded allocation) are **registered for the next wave** —
neither changes 0.1.118 behavior; default arm unaffected.

<details><summary>Original registration (2026-11-16, closed by Pairing 3)</summary>

Automated commit security review flagged three upstream-carrier issues in
`createDefaultReadonlySessionRuntime` (0.1.117). All are upstream-runtime
internals — AtlasWeb cannot fix them consumer-side and will not hand-patch.
Until upstream shipped corrected releases, the default carrier was exercised
**only against trusted seeded fixtures**, never untrusted transcripts:

1. [HIGH] Cyclic transcript metadata → DoS in engine traversal
   (no visited-UUID bound / corruptData rejection).
2. [HIGH] TOCTOU / authorized-storage escape (CWE-367): replay path
   re-opens pathname after validation; needs descriptor-based read chain.
3. [MEDIUM] Transcript parsing resource-limit bypass: record byte/count
   limits not enforced pre-parse on the full-file loader path.

**These three were G2 blockers for real-data four-face verification.**
Registered upstream (atlas-mainline-f4 / Main); resolved by the S0-R3 ticket
(PRs/ticket per Pairing 3). Leg-② expected shape revised by 工单 §9-7 终裁:
bounded gap-null rejection, not `corruptData` (projection-level corruptData
mapping is consumer freedom, not a gate criterion).

</details>

## Pairing 5 — S0-R5 follow-recovery carrier (2026-11-16)

| Field | Value |
|---|---|
| Upstream release | `@atlasharness/atlascode@0.1.121` (npm latest; release `2c94f90f`, tag v0.1.121; SRI `docs/sri/v0.1.121.md`; npm dist.integrity `sha512-ahsY0qOV…1Tw==` identical to SRI; tarball sha256 `7fd3f95c…8f7513e4` registry 直下复核) |
| Verified installed | `cli.js` 18,218,608B / sha256 `874ad82a…329302076`（SRI = installed 两点恒等；0.1.120↔0.121 Δ=0，两缺口改动全在 web 域）; `web-contract` 7,975B（九版恒等）; `web-session-runtime/index.js` 85,213B / sha256 `3747eb5e…f4cef511` |
| New faces (S0-R5) | ② rewrite-larger（同 inode size>byteOffset）→ 重采样兜底：显式 `resetRequired` fail-arm（禁 `corruptData` 硬终端）；③ `resumeCursor` 实装：合法 cursor → 零重放续接（无 baseline 重发，replacement 流续）；未知/过期 cursor → 显式 fail-arm（`resetRequired` 或 `error{cursorExpired}`，禁静默 baseline 重放） |
| Consumer legs | `e2eFindings.test.ts` ③ flip（fail-arm 断言）+ ③b 新增（合法 cursor 零重放续接全程）+ ⑥-A 新增（rewrite-larger → resetRequired，corruptData 必缺席）；RED 先行于 0.1.119 三腿全红，0.1.121 全绿 |
| Host-side fix found in adoption | SSE 流头冲刷：`writeHead()` 后须 `res.flushHeaders()`——零重放 resume 首事件可能长期不到达（零新写入），头缓存至首写 → 消费者悬挂于无头连接；0.1.119 下被「resume 恒发 baseline」掩盖。判据腿 `followStream.test.ts` flush-headers 腿 |
| Gate truth table | EXPECTED 锚升级（0.1.121↔0.1.119）；格 I 背书重出（Pin 变更 → 旧背书对表翻 gap 按设计生效） |

## Pairing 6 — 0.1.122 docs-only carrier (2026-11-17)

| Field | Value |
|---|---|
| Upstream release | `@atlasharness/atlascode@0.1.122`（npm latest；release `f6988c88`，tag v0.1.122；SRI `docs/sri/v0.1.122.md`；npm dist.integrity `sha512-HQx6UImE…Dag==` = SRI 三源一致） |
| 波形 | **docs-only（零产品码）**：上游 docs 归一化波（A 段下游-facing reference + B 段内部治理五面）；生产 lane PASS @531fd8c8 |
| Verified installed | `cli.js` 18,218,608B / sha256 `874ad82a…329302076`（**与 0.1.121 字节级恒等**，SRI docs-only 恒等实证）；`web-session-runtime/index.js` 85,213B / `3747eb5e…` 恒等；`web-contract` 7,975B 恒等；差异仅 docs 面（unpacked +650B） |
| Consumer legs | 全套件 GREEN（除背书对表行按设计翻 gap）；零行为位移 → 消费腿零改 |
| Gate truth table | EXPECTED 版本位移 0.1.121→0.1.122（锚前缀双面同值，恒等实证注记在案）；格 I 轻量重出（downgrade 0.1.121） |

## Pairing 7 — S0 0.1.123 modelRoles normalizeRef carrier (2026-11-17)

| Field | Value |
|---|---|
| Upstream release | `@atlasharness/atlascode@0.1.123`（npm latest；release `88e343b8`，tag v0.1.123；SRI `docs/sri/v0.1.123.md`；npm dist.integrity `sha512-IpAbH2zH…Acn4A==` = SRI 三源一致） |
| 波形 | **产品码波**：modelRoles 池臂 normalizeRef 根修（issue #3-1，PR #4 as-is + Main fixup；gate r-20261117-gate-0123 GATE-PASS）；bun 1.4.4 工具链新锚 |
| Verified installed | `cli.js` 18,219,983B / sha256 `a960bb5f…913ccc`（= SRI 恒等）；**`web-session-runtime/index.js` 85,213B / `3747eb5e…f4cef511` 字节级未变**（SRI「工具链新锚同面预期变更」注记实测未兑现——runtime 零位移）；`web-contract` 7,975B 十版恒等 |
| Consumer faces | 零位移——roles 域改动不触四读面/恢复语义；套件全绿（除对表行按设计翻 gap）；S0-R5 语义腿 standing |
| Gate truth table | EXPECTED 升级（0.1.123↔0.1.122 新锚对）；格 I 全量重出（产品码波不适用 docs-only 降格） |

## Pairing 8 — S0 0.1.124 theme-WCAG carrier (2026-11-18)

| Field | Value |
|---|---|
| Upstream release | `@atlasharness/atlascode@0.1.124`（npm latest；release `e2ae5598`，tag v0.1.124；SRI `docs/sri/v0.1.124.md`；npm dist.integrity `sha512-bVZI3OVs…VIA==` = SRI 三源一致） |
| 波形 | **产品码波**：theme 灰阶 WCAG 对比度硬化（外部 PR #5，C 形第二例；GATE-RED→改判→GATE-PASS→prodlane PASS） |
| Verified installed | `cli.js` 18,219,983B / sha256 `4f75289b…1eabd9`（= SRI 三点链第二例；size 与 0.1.123 恒等、hash 变更源 = theme 常量字面值）；**`web-session-runtime/index.js` 85,213B / `3747eb5e…f4cef511` 字节级未变**；`web-contract` 7,975B 恒等 |
| Consumer faces | 零位移——theme 常量域不触四读面/恢复语义；套件全绿（除对表行按设计翻 gap）；S0-R5 腿 standing |
| Gate truth table | EXPECTED 升级（0.1.124↔0.1.123）；格 I 全量重出（产品码波） |

## T6-A wave closeout record — shell 基座移植 + Code 只读 bundle (2026-11-20)

Plan `docs/superpowers/plans/2026-11-19-t6a-shell-port-plan.md`（审计通过，双信号授权）；Tasks 1–10 全闭环。本节为波级收口档（Pairing 行保持逐 carrier 不变，此处记波内事实）。

| Field | Value |
|---|---|
| Deliverables | `packages/web-{brand,mode,code}`（四视图只读 bundle）+ `apps/atlasweb` vite 6.4.6 构建入口（main.tsx boot 装配链：web-renderer client → theme → brand → layout → web-code → mount）+ `docs/t6a-readonly-lexicon.md`（11 词表单一事实源） |
| Task 8 / 9 审计 | Atlas-reveiw 采认（Task 8 +1 条件；Task 9 采认全合） |
| 边界交叉 scan | **violation=0，allowed=true，externalImports=238**。复合形：programmatic runner（CLI 无 external-deps 面）+ closure evidence（package.json deps 并集 + tsconfig vendor 别名 9 项 + node: builtins ×10 + mdast 类型包映射）；扫描器语义补丁在 AtlasCode 侧 TDD 落地（commit `7eecb79c`：bundler query 后缀剥离 + 模块标识符字符集门，均负腿锁定）；扫描捕真 2 条缺失依赖行已补（web-renderer use-sync-external-store、web-shell @atlasweb/web-modules，commit `7b579b2`） |
| 门格 | 全仓 bun test **381 pass / 1 skip / 0 fail**（54 files）；web-host 专项 **43/0**；G1/G2 真值表 admitted（clean-candidate 行提交后复评自解，同 Task 8 先例）；只读红线 = 词表扫描源面 + dist 面零命中（smoke 腿内含） |
| 依赖行 bump 判定 | carrier pin `@atlasharness/atlascode@0.1.124` **版本 + sha512 恒等**（变更行数=0 预期成立）；lockfile delta 仅解析注记面（npmmirror registry URL 字段 + atlascode/{ink,react} 子路径条目），Task 9 审计注记既案 |
| react-virtual dep 行处置 | **行已删除**（web-shell platform.ts，Task 7 零消费剔除纪律；Task 8 维持零消费——web-code windowing.ts 以自算切片供给同判据：固定估高行窗 + overscan，单代码路径、DOM-free 可直测；react-virtual hook 形需浏览器测量，测试约束内不可运行）。**swing-back 语义登记**：冻结清单预注册的 @tanstack/react-virtual 仍为白名单可用项；re-trigger 形 = 后续波出现真实虚拟化需求（变高行/超大体量列表）时，恢复 dep 行 + platform 表再录入 + windowing 供给切换为 hook 形（有界挂载判据 REPLAY_WINDOW_SIZE=60+overscan 10 不变，仅换供给）；回摆须过 R1 回审（冻结清单增补），Task 8 停腿语义照常 |
| insertAdjacentHTML 处置 | web-shell apply-injections.ts（dsh 原形逐字移植）：结构化 index-injection 表解释器，`insertAdjacentHTML('beforeend', row.html)` 的源面 = boot payload 静态注入表（web-host seed 构造，编译期事实，非用户输入汇）；script 行走 textContent/script-src 行走 loadScript transport。保留，无需改造 |
| THIRD_PARTY_NOTICES 核对 | 零新增第三方源移植面：dsh（MIT）+ vendored cordis 既有覆盖不变；本波新增 npm 运行时依赖为声明行补齐（use-sync-external-store MIT），vite/@vitejs/plugin-react 为 devDep 不入产物 |
| 版本候选 | `apps/atlasweb` 0.1.0 候选——**tag 不自发**；e2e lane 回执 + 发布链候用户 |
| 登记债 | D-1 katex 数学渲染 / D-2 shiki 语法高亮 / D-3 桌面字号快捷键——均 open（内容无损降格，R1 回审通道，见 plan §Registered debts）；**B 案保真减损用户显性 OK（2026-11-20，「OK，同意」@AtlasCode master c35405a2 §H，绑定条件③闭环）——B 案即波终态** |

### T6-A closeout addendum — 审计 verdict 与条件兑现 (2026-11-20)

| Field | Value |
|---|---|
| 审计 verdict | Atlas-reveiw 波终抽验 **有条件采认**：全门格独立复现（干净树 382-run / web-host 43/0 / 边界扫描独立复跑 violation=0 / scanner 补丁 23/0 / carrier pin 双点实读恒等 / 波档六面对表全在案）+ 定形采认 1 条（use-sync-external-store 补声明 = phantom-dep formalization 非新增依赖，§C-2(c) 不触发完整重验） |
| 审计复跑插曲（如实档） | 审计侧两轮假阳性：CLI 形 230 violations（CLI 无 external-deps 面，fail-closed 如实）；programmatic 形 6 violations（证据装配缺口：node:module 漏列 + mdast 裸指明符未映射）——两轮均被证据面解释、无一带过，**fail-closed 语义实证** |
| 条件兑现：收口门 runner 落仓 | `scripts/verify-kernel-boundary.ts`（本仓）——一条命令复现波终门：闭包证据全从本仓现读（manifest deps∪devDeps 全 workspace 面 + tsconfig.base.json paths 派生 vendor 别名 9 + node 内建 ×10 逐项列举 + mdast→@types/mdast 映射），scanner 单一事实源 = 配对仓 AtlasCode（ATLASCODE_ROOT 覆写，不 vendored 不手拷）；退出码 0/1/2 三态 fail-closed。**canonical 复现值：allowed=true / violations=0 / externalImports=238 / roots 16 / declared 54**（与波档原录 238 恰合；审计侧 230 = 复建装配广度差，落仓后单一装配面收口） |
| 判据腿 | `packages/web-host/test/kernelBoundaryRunner.test.ts` 3 腿：runner 在位 + 一条命令复现断言（allowed/violations/证据面）+ fail-closed 负腿锁（scanner 缺席 → exit 2 零结论产出，环境缺口不得伪装成绿） |

## Release record — @atlasharness/atlasweb 0.1.0 (2026-11-20)

| Field | Value |
|---|---|
| 授权 | 用户批 0.1.0 首发 + npm 发布；包名钉定 `@atlasharness/atlasweb`（AskUserQuestion，家族 scope 一致形，账号 vincentlau2026 持 scope） |
| 发布链 | 发布 staging script 落仓 `scripts/build-npm-package.ts`（版本=收口契约：root 单源 + apps 同值 fail-closed；dist 现构建；staging manifest 生成，源 workspace manifest/bun.lock 不动）→ SRI `docs/sri/v0.1.0.md` → tag `v0.1.0`（local，repo 无 remote）→ `npm publish ./build/atlasharness-atlasweb-0.1.0.tgz --registry npmjs.org --access public` |
| 发布提交 | `84057aa`（clean-tree 389 pass / 1 skip / 0 fail，56 files；tarball 发布提交树终验字节恒等） |
| Tarball SRI | sha256 `0c4125a7…75c8e10`；sha512 `sha512-HOQz8+9x…INDOA==`；clean-tree 重建 ×4 恒等（FORCE_COLOR 0/3 两档） |
| Registry 对表 | `npm view dist.integrity` = `sha512-HOQz8+9x…INDOA==` **与 SRI 逐字一致**（传播 ~3min） |
| 安装品验证 | registry 沙箱 `npm install @atlasharness/atlasweb@0.1.0`：三内容物（index.html 573B / JS 586,054B / CSS 32,662B）**与 SRI 字节级恒等**；静态 serve 烟测 GET / 200（boot 装配链头注在场）+ 两 asset 200 精确字节 + **安装品词表零命中**（只读红线 installation-level）；0 vulnerabilities |
| 定因入册 | ambient `NODE_ENV`（bun test=test）经 vite define 泄进 bundle——泄漏形 `index-mmlMhzHG.js`/`08431d6c…` 逐字节复现；修形 = staging script 钉 `NODE_ENV=production` + 发布锚腿（bun test 环境内产出 == 发布锚，泄漏形负锁）；FORCE_COLOR 两档实测零差 |
| 勘误入册 | `npm publish` 相对路径无 `./` 前缀被误判 git spec（ls-remote 报错）——发布命令一律 `./` 前缀 file 形 |
| 候办 | repo remote 缺席（tag local-only）——GitHub/GitCode 推送候用户给 remote；AtlasCode 仓 `atlasharness-atlascode-0.1.120.tgz` 旧根残留与本包无关 |

### Release addendum — npm 双组织 + 版本契约 (2026-11-20)

| Field | Value |
|---|---|
| 版本契约 | 用户裁定 `docs/version-contract.md`：升级默认只升 0.1.x（0.2.0+/1.x 须用户明裁） |
| npm 双组织 | `@atlasharness/atlasweb@0.1.0`（前发）+ `@atlaswork/atlasweb@0.1.0`（org atlaswork，vincentlau2026=owner；token 双组织通用，用户供 `~/.ssh/npmjs-atlas-token.txt`，staging script `--name` 参数化 @`f5671b0`，temp npmrc 用后即清） |
| 第二形 SRI | sha256 `eb491e35…84a5f2` / sha512 `sha512-2tw89ByV…T3wA==`（docs/sri/v0.1.0.md 双组织节）；内容物与 @atlasharness 形字节恒等（仅 manifest name 差） |
| GitHub 仓 | `github.com/vincentlau2046/AtlasWeb`（public，precedent=AtlasCode 形）：main + tag v0.1.0 已推（双平台 repo 面 1/2；GitCode 侧未启——用户澄清"两平台"=npm 双组织，GitCode org 探测线撤销） |
