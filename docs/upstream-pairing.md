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
| 格 D search face | **UPSTREAM GAP registered** (signal to atlas-mainline-f4 2026-11-16): `ReadonlySessionRuntime` exposes list/replay/follow only; contract schema `SearchSessionsRequestSchema` exists but no runtime implementation. AtlasWeb does not hand-copy projection-search semantics (`renderableSearchText` engine domain) and will not ship a title-filter stand-in. Blocked pending upstream wave; then anchor upgrade + 格 D search legs |
| Suite | 19 pass / 0 fail (7 files) |

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
