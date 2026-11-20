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

The bundle is fully static — serve `dist/` with any static file server:

```sh
npx serve node_modules/@atlasharness/atlasweb/dist
```

It talks to an AtlasCode web-session host (launched via
`@atlasharness/atlascode`'s web-host launch surface) on the same origin.
Pass the launch token as `?token=<token>`; the app redeems it against the
host and strips it from the address bar.

## Versioning

`0.1.x` tracks the AtlasWeb shell foundation wave (T6-A). The package is
built from the paired AtlasWeb repository; versions are release-contract
pins paired against the AtlasCode carrier (`@atlasharness/atlascode`).

## License

MIT — see the repository for third-party notices (dsh baseline, vendored
Cordis).
