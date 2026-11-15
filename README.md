# AtlasWeb

AtlasWeb is the unified Web platform for the Atlas product family: **AtlasCode**,
**AtlasOffice**, and **AtlasComic**. It is an independent repository — never a
subdirectory or worktree of AtlasCode.

## Architecture (five layers)

```
载体 (Web/TUI)  →  产品 (Code/Office/Comic)  →  平台 shell  →  host/controllers  →  kernel/shared contract
```

- The platform shell is brand-free and product-free; the main work surface is a
  `layout.main` slot registered by product bundles. Chat is not hard-coded.
- The Atlas host keeps the product session runtime in-process and talks to
  browsers over loopback HTTP/WS with launch-token → signed-cookie auth.
- AtlasWeb consumes the published upstream contract
  (`@atlasharness/atlascode` subpaths `./web-contract` and
  `./web-session-runtime`). It never imports `AtlasCode/src/**`, never copies
  schemas, and never reads product config directories directly.

## Workspace

```
apps/atlasweb            platform app entry
packages/web-shell       boot/modules/connection/store/slots/renderer host shell
packages/web-host        Atlas host: HTTP/WS, auth fence, session controllers
packages/web-connection  connection generations, baseline+replacement reconnection
packages/web-store       client state stores
packages/web-slots       slot registry (layout.main and friends)
packages/web-renderer    message/block renderers
packages/web-layout      layout primitives
packages/web-primitives  shared UI primitives
packages/web-theme       dark-first theme tokens
packages/web-modules     module system
packages/web-brand       Atlas brand registration
packages/web-mode        Atlas-X product mode mechanism
packages/web-code        AtlasCode (Chat/agent) bundle
packages/web-office      AtlasOffice bundle (placeholder, later)
packages/web-comic       AtlasComic bundle (placeholder, later)
vendor/                  vendored upstream sources (MIT, pinned)
docs/                    platform docs, gates, reports
```

## Governance

- Independent Git history, branches, tags, and CI. Platform versioning starts
  at `0.1.0` after the foundation gate (G2).
- Every verified pairing with upstream AtlasCode records the exact upstream
  commit, package version, artifact integrity, and protocol version in the
  family manifest (owned with AtlasCode `docs/products/`).
- Gates: G1 (implementation admitted — development allowed), G2 (foundation
  releasable — all hard gates green). See `docs/` for the S0 agreement.

## Third-party notices

The shell foundation is adapted from DeepSeek Harness (dsh), MIT licensed.
Attribution lives in `THIRD_PARTY_NOTICES.md` and is updated with the first
release.
