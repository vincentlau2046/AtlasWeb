# @atlasharness/atlasweb

AtlasWeb shell — the unified Web platform front-end for the Atlas product
family (AtlasCode / AtlasOffice / AtlasComic). This package ships the built,
read-only Code view bundle: session list, conversation replay, search, and
live follow over the [AtlasCode](https://www.npmjs.com/package/@atlaswork/atlascode)
web-session runtime.

## What's inside

`dist/` — a static single-page bundle (vite 6, React 18, es2022 target):

- `index.html` + hashed JS/CSS assets; no server-side code.
- The default face is the read-only session view (session list, replay,
  search, live follow). The interactive execution face (composer, turn
  queue, approval cards) mounts only when the host is started with
  `--execution` and the page carries a `?workspace=` hint or a workspace is
  picked from the discovery list — see "Execution lane" below.

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
# e.g. ~/.atlas/projects/-home-vince-projects-atlascode (path '/' and '.'
# each map to '-').
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

### Execution lane (interactive coding sessions)

The read-only command above never mounts the composer. To serve interactive
execution sessions, start the host with the execution flags:

```sh
atlasweb --port 8940 --scope main=<scope-dir> \
  --execution --workspace demo=<workspace-dir> --actor-id <actor-id>
```

- `--execution` — mounts the execution channel: composer, turn queue, live
  transcript, and approval cards.
- `--workspace <id>=<dir>` — authorizes a workspace binding (`id` →
  directory). Required at least once with `--execution`; repeatable for
  multiple workspaces. The engine runs with that directory as its working
  directory, and every submit is authorized against this binding
  server-side (the discovery list only discloses visibility — selecting a
  workspace is not itself an authorization).
- `--actor-id <id>` — non-empty actor identity recorded with execution
  turns. Required with `--execution`.
- `--workspace` / `--actor-id` are only valid together with `--execution`
  (the launcher fails closed otherwise).

UI entry: open the app with a `?workspace=<id>` hint
(`http://127.0.0.1:<port>/?workspace=<id>`), or pick a workspace from the
discovery list shown when no hint is present. Without a hint and without a
selection the page stays read-only by design.

Engine prerequisites (per turn the execution lane spawns the AtlasCode
engine CLI):

- `@atlaswork/atlascode` must be resolvable on `PATH` (its `atlas` bin);
- the engine reads its model config from `ATLAS_CONFIG_DIR` (defaults to
  `~/.atlas`; must contain `settings.json` and `.credentials.json`);
- session transcripts persist as JSONL under the scope directory as
  `<session-id>.jsonl`. The engine derives its per-project storage dir by
  encoding the workspace directory path with **both** mappings: each `/`
  **and** each `.` becomes `-` (e.g. a cwd of `/home/vince/proj.app`
  projects to `-home-vince-proj-app`). The `--scope` directory must be
  derived with the same double mapping, or the engine's session store will
  not line up with the served scope.

Launch tokens stay single-use as above: a consumed, expired, or invalid
link always renders the recovery notice — re-run `atlasweb …` for a fresh
link; a consumed link can never be reopened.

## Versioning

`0.1.x` tracks the AtlasWeb shell foundation wave (T6-A). The package is
built from the paired AtlasWeb repository; versions are release-contract
pins paired against the AtlasCode carrier (`@atlaswork/atlascode`).

## License

MIT — see the repository for third-party notices (dsh baseline, vendored
Cordis).
