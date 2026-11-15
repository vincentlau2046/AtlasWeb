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

`createReadonlySessionRuntime` requires an injected `engine`
(`loadTranscriptFull` + `buildConversationChain`). The real engine body lives
in AtlasCode `src/atlascode/web/runtimeDefault.ts` and is intentionally **not**
in the pack. Until an upstream-supported engine carrier subpath exists,
AtlasWeb integrates the four faces against a test engine and seeded fixtures
only; **real-data G2 four-face verification is blocked on that carrier** and
must not be faked with a hand-copied engine. Registered upstream for
scheduling (S0-R follow-up ticket, owner mainline f4 / Main).
