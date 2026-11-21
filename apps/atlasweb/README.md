# @atlasharness/atlasweb

AtlasWeb shell — the unified Web platform front-end for the Atlas product
family (AtlasCode / AtlasOffice / AtlasComic). This package ships the built,
read-only Code view bundle: session list, conversation replay, search, and
live follow over the [AtlasCode](https://www.npmjs.com/package/@atlaswork/atlascode)
web-session runtime.

## What's inside

`dist/` — a static single-page bundle (vite 6, React 18, es2022 target):

- `index.html` + hashed JS/CSS assets; no server-side code.
- Read-only by contract: no composer, approval, or message-submit surface
  (enforced by the repository's readonly-lexicon gate).

## Serving

### Installed package: one command (A1)

The npm package ships a self-contained Node entry (`bin.atlasweb` →
`server/atlasweb.js`, an ESM bundle that embeds the pinned
`@atlaswork/atlascode/web-session-runtime` — the installed package has no
npm runtime dependencies and needs only Node ≥ 20; no Bun required):

```sh
npm install @atlasharness/atlasweb   # or @atlaswork/atlasweb
atlasweb --port 8940 --scope main=<scope-dir>
# <scope-dir> is the AtlasCode session storage dir for your project,
# e.g. ~/.atlas/projects/-home-vince-projects-atlascode (cwd with '/' → '-').
```

The static root is fixed to the package's own `dist/`; it prints one ready
line with a single-use launch `token`. Open
`http://127.0.0.1:<port>/?token=<token>`; the app redeems it against the
host (HttpOnly cookie) and strips it from the address bar. A consumed,
expired, or invalid open link renders a recovery notice (re-run `atlasweb …`
for a fresh link) — it never falls back to an implicit authorization.

### From the repository checkout

The repository's web-host launcher serves the same face from source:

```sh
bun packages/web-host/src/launchCli.ts --port 8940 \
  --static node_modules/@atlasharness/atlasweb/dist \
  --scope main=<scope-dir>
```

`--static` is optional: without it the host serves only the API (pair with
any static file server / reverse proxy for the UI). The launcher itself is
part of this repository (`packages/web-host`) and is not yet published as a
standalone binary.

## Versioning

`0.1.x` tracks the AtlasWeb shell foundation wave (T6-A). The package is
built from the paired AtlasWeb repository; versions are release-contract
pins paired against the AtlasCode carrier (`@atlaswork/atlascode`).

## License

MIT — see the repository for third-party notices (dsh baseline, vendored
Cordis).
