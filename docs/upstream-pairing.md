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
