# Scramjet (local copies + integration)

This directory holds the parts of Scramjet we build ourselves rather than
consume pre-bundled from `node_modules`. Layout:

| Subdir | Upstream source | Role |
|---|---|---|
| `config/` | (DDX-local) | Scramjet config + flags used by the host page. Not from upstream. |
| `controller/` | `MercuryWorkshop/scramjet @ v2.0.6-alpha` → `packages/controller/` | The IIFE that exposes `$scramjetController` in the host page, service worker, and proxied frames. We modify this. |
| `utils/` | `MercuryWorkshop/scramjet @ v2.0.6-alpha` → `packages/utils/` | Reference plugins (`HttpCachePlugin`, etc.). **Not currently imported by the app** — kept as a reference for writing local plugins. See "Writing plugins" below. |
| `rpc/` | `MercuryWorkshop/scramjet @ v2.0.6-alpha` → `packages/rpc/` | `RpcHelper` class the controller depends on. Not published; kept here. |

## How imports resolve

The local sources still use bare specifiers like
`@mercuryworkshop/scramjet-controller` and `@mercuryworkshop/rpc` so they
match upstream verbatim (easier to diff and re-sync). Those specifiers
are redirected to these directories by:

- `tsconfig.json` `compilerOptions.paths`
- `tsconfig.build.json` `compilerOptions.paths`
- Each `controller/rolldown.*.config.ts` `resolve.alias`

If you add a new local Scramjet package or rename one, update **all of
the above**. Vite picks up the tsconfig paths via `vite-tsconfig-paths`
(no separate Vite alias needed).

## Build

`controller/` ships three outputs that are loaded by very different
runtimes (host page, service worker, proxied iframe), so each gets its
own rolldown config:

- `controller/rolldown.api.config.ts`    → `dist/api.js`    (host page IIFE → `$scramjetController`)
- `controller/rolldown.sw.config.ts`     → `dist/sw.js`     (service worker handlers)
- `controller/rolldown.inject.config.ts` → `dist/inject.js` (proxied-frame bootstrap)

`srv/vite/copy.ts` picks these up from `dist/` and copies them into the
app's static assets at build time.

`config/` has a single rolldown config that produces `dist/config.js`
(loaded by the host page before scramjet itself).

`rpc/` has no separate bundle — it's pulled in by the controller's
rolldown configs via path alias.

`utils/` currently has no consumer. It used to be imported by
`src/apis/proxy.ts` for `HttpCachePlugin`, but that wiring was removed
(see "Writing plugins" below for why and what to do instead).

### Scripts

- `npm run controller:build` — builds the three controller outputs in
  one shot. Wired into `npm run build` automatically (runs before
  `tsc` + `vite build`).
- `npm run config:build`    — builds `config/dist/config.js`.
- `npm run dev`              — `devserver.ts` registers rolldown watchers
  for all of the above, so saves to any source file in this tree
  trigger an incremental rebuild.

## Re-syncing with upstream

1. Pick a new scramjet tag, e.g. `v2.0.7-alpha`.
2. For each file in `controller/src/`, `utils/src/`, or `rpc/`:
   ```
   curl https://raw.githubusercontent.com/MercuryWorkshop/scramjet/<TAG>/packages/<pkg>/src/<file>
   ```
3. Re-add the `// @ts-nocheck` directive at the top of each `.ts` file
   (NOT `.d.ts`). The upstream sources don't pass our stricter
   `noUnusedLocals` / `noUnusedParameters` flags, and `@ts-nocheck` is
   how we skip type-checking them without diverging from upstream.
4. Re-apply any local modifications you'd already made.
5. Run `npm run build` to confirm nothing broke.

The upstream sources reference build-time constants
(`SCRAMJET_EXPECTED_VERSION`, `CONTROLLER_EXPECTED_VERSION`). These are
injected by:

- `controller/rolldown.api.config.ts` `transform.define` (for
  `SCRAMJET_EXPECTED_VERSION` used in `controller/src/version.ts`).
- `vite.config.ts` `define` block (for both constants used in
  `utils/src/version.ts`). The Vite define is still active even though
  no app code currently imports utils — it's cheap and keeps the source
  evaluable if a future plugin module pulls utils in.

Both pull their version strings from the installed
`node_modules/@mercuryworkshop/{scramjet,scramjet-controller}/package.json`
so you don't have to update them manually when bumping the scramjet
dependency.

The third upstream constant, `CONTROLLER_VERSION` (used by
`controller/src/version.ts` to set the exported `VERSION`), is hardcoded
as a literal in that file rather than injected via `define`. It's the
controller's own version string and changes about as often as the source
itself, so the literal is simpler. Update it there if you cut a new
local controller revision.

## Writing plugins

`utils/` contains the upstream "stock" plugins (`HttpCachePlugin`,
`UrlWatcherPlugin`, `CatchEscapedLinksPlugin`, `LinkHandlerPlugin`,
`EventHandlerPlugin`, `setupAlwaysLastBubble`). They're a useful
reference but **not currently imported by the app**.

Why: importing `@mercuryworkshop/scramjet-utils` from app code (via
the path alias) causes Vite to traverse the utils source's `import {
versionInfo, BareResponse, ... } from "@mercuryworkshop/scramjet"`
declarations. Those resolve to the published package's
`dist/scramjet-external.mjs` runtime stub, which does
`const __external = globalThis.$scramjet` at module top level and
crashes with `Cannot destructure property 'BareResponse' of
'globalThis.$scramjet' as it is undefined` if it evaluates before
the IIFE script tags (`assets/s.js` + `assets/api.js`) have run —
which can happen in Vite dev mode where ESM module-graph traversal
isn't strictly ordered against deferred classic scripts.

What to do instead: write plugins in their own DDX files (not under
`utils/src/`) and avoid value imports from `@mercuryworkshop/scramjet`
at the top level. Two clean patterns:

1.  **Read scramjet symbols lazily from `globalThis.$scramjet`** inside
    the plugin's methods/constructor, after the IIFE has loaded. Mirror
    the upstream plugins' shape (e.g. extend `ManagedPlugin` and tap
    `frame.fetchHandler.hooks.fetch.*`), but get the constructors via
    `globalThis.$scramjet.BareResponse` etc. at call time rather than
    via static imports.

2.  **Wire plugin instances via `proxy.createFrame(element, { plugins:
    [...] })`** the way the prior `HttpCachePlugin` wiring did. The
    controller's `Frame` constructor takes a `plugins` array; each
    entry's `install(frame)` runs on frame creation.

The `utils/src/*.ts` files are good templates — copy the relevant one,
rewrite the value imports as lazy global reads, drop the file into
`src/apis/` (or wherever it conceptually belongs), and import only its
class from `proxy.ts`.
