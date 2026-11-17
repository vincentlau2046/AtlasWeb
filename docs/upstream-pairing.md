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
