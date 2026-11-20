# @atlasharness/atlasweb

AtlasWeb shell — the unified Web platform front-end for the Atlas product
family (AtlasCode / AtlasOffice / AtlasComic). This package ships the built,
read-only Code view bundle: session list, conversation replay, search, and
live follow over the [AtlasCode](https://www.npmjs.com/package/@atlasharness/atlascode)
web-session runtime.

## What's inside

`dist/` — a static single-page bundle (vite 6, React 18, es2022 target):

- `index.html` + hashed JS/CSS assets; no server-side code.
- Read-only by contract: no composer, approval, or message-submit surface
  (enforced by the repository's readonly-lexicon gate).

## Serving

One command serves both the UI and the session API on the same origin: the
repository's web-host launcher takes `--static` pointing at this bundle's
`dist/` directory (from the installed npm package or a local build):

```sh
# from the paired AtlasWeb repository checkout
bun packages/web-host/src/launchCli.ts --port 8940 \
  --static node_modules/@atlasharness/atlasweb/dist \
  --scope main=<scope-dir>
# <scope-dir> is the AtlasCode session storage dir for your project,
# e.g. ~/.atlas/projects/-home-vince-projects-atlascode (cwd with '/' → '-').
```

It prints one ready line with a single-use launch `token`. Open
`http://127.0.0.1:<port>/?token=<token>`; the app redeems it against the
host (HttpOnly cookie) and strips it from the address bar. Browsers boot the
UI without credentials — the static face sits in front of the auth gate and
API calls ride the ambient cookie.

`--static` is optional: without it the host serves only the API (pair with
any static file server / reverse proxy for the UI). The launcher itself is
part of this repository (`packages/web-host`) and is not yet published as a
standalone binary.

## Versioning

`0.1.x` tracks the AtlasWeb shell foundation wave (T6-A). The package is
built from the paired AtlasWeb repository; versions are release-contract
pins paired against the AtlasCode carrier (`@atlasharness/atlascode`).

## License

MIT — see the repository for third-party notices (dsh baseline, vendored
Cordis).
