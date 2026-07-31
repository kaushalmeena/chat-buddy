# Build, delivery and deployment

## Build and bundle

**Vendor chunks name what comes out, not what goes in.** `manualChunks` in
[`vite.config.ts`](../vite.config.ts) assigns `react` and `motion` from two small
explicit sets, and everything else in `node_modules` to one `vendor` chunk.

The previous approach listed the markdown pipeline's packages by name, and it had
already drifted: `style-to-js`, `dequal`, `is-alphabetical` and several others were
missing, so roughly 100 kB of third-party code was landing in the entry chunk. An
allow-list of ~80 transitive packages cannot survive a dependency update. Inverting
the rule fixed the leak and removed the maintenance — the entry chunk went from
154 kB to 51 kB.

Matching is on the full package boundary, not a prefix: `react` as a prefix also
matches `react-markdown`.

**The WebLLM engine is excluded from the service worker precache.** It is a ~6 MB
chunk most visitors never load, and the weights it fetches are hundreds of megabytes
more, cached by the engine itself. Precaching any of it would make a first visit pay
for a feature nobody opted into.

**`chunkSizeWarningLimit` is set above the WebLLM chunk.** A warning that fires on
every build is one everyone learns to scroll past.

Approximate gzipped initial load: vendor ~80 kB, React ~57 kB, motion ~41 kB, app code
~17 kB. The WebLLM chunk (~2.1 MB gzipped) is lazy and loads only on opt-in.

## The service worker

Hand-written, in [`worker/service-worker.ts`](../worker/service-worker.ts), and built by
[`plugins/service-worker.ts`](../plugins/service-worker.ts) — a ~130-line Vite plugin
that injects the precache manifest and transpiles with `transformWithOxc`, which Vite
already exports, so it costs no dependency.

It replaced `vite-plugin-pwa`. That plugin pulled in `workbox-build`, whose tree
carried every high-severity advisory in the project and pinned Babel 7, which forced
an npm override to install `@vitejs/plugin-react`. Removing it took the project to
**zero vulnerabilities and zero overrides**.

The caching is deliberately simple: precache a content-hashed shell, serve navigations
network-first with the cached shell as fallback, serve precached assets cache-first,
and leave everything else to the HTTP cache. Updates install but wait — a new worker
never takes over until [`register-sw.ts`](../src/register-sw.ts) asks, so an update
cannot replace the app mid-reply.

Three traps found by actually testing with the server stopped, all of which produce
the same symptom — the shell loads, every asset reports a cache hit, and nothing runs:

- **`cache.addAll` fetches with `mode: "no-cors"`**, giving opaque responses. Vite marks
  its scripts and stylesheet `crossorigin`, and an opaque response cannot satisfy a
  CORS-mode load. `cssRules` threw `SecurityError` and no module executed.
- **`mode: "cors"` fixes that but sends an `Origin` header**, and the server answers
  `Vary: Origin`. Cache matching honours `Vary`, so nothing ever matched the page's
  requests, which send no `Origin`. Same symptom, opposite cause.
- **`mode: "same-origin"` is the accurate choice** — `basic` response, no `Origin`
  header — plus `ignoreVary: true` on lookups, since nothing about a content-hashed
  file genuinely varies by header.

And the original v1 bug this file exists to not repeat: an `activate` handler that
deleted the cache `install` had just filled.

## Conventions

- **Filenames** follow what the file exports: `PascalCase.tsx` for components,
  `camelCase.ts` for hooks (so `useChatAutoScroll.ts`), `kebab-case.ts` everywhere
  else. Biome enforces the first two per-directory via `useFilenamingConvention`.
- **Tests** live in `__tests__/` beside the code they cover.
- **Components** declare functions normally and `export { … }` once at the bottom of
  the file.
- **Imports** use the `@/` alias whenever they cross a top-level folder, and stay
  relative within one. That keeps `../../` chains out of the codebase entirely.
- **Ambient types** for non-standard browser APIs live in `src/types/`, declaring only
  the members actually used. `LanguageModel.params()` is documented but absent from
  some shipping Chrome builds, so it is deliberately not declared — declaring an API
  that may not exist invites a call that type-checks and then crashes.
- **`npm run verify`** runs lint, typecheck and tests. It is the gate in
  `.github/workflows/deploy.yml`; nothing is built for Pages until it passes.

## Deployment

GitHub Actions builds and publishes to GitHub Pages on every push to `main`:
`verify` → `build` → `deploy`. A pull request stops after `verify`, so nothing is ever
published from a branch.

**The base path is the whole difficulty.** A Pages project site is served from
`/<repo>/`, not the domain root, and this app emits absolute URLs in five places:

| What | How it is handled |
| --- | --- |
| Asset URLs in `index.html` | Vite rebases these from `base` automatically |
| The worker's precache list | `plugins/service-worker.ts` prefixes every entry with the resolved `base` |
| The worker's app-shell URL | Resolved at runtime from `worker.location`, so it needs no injection |
| The worker's script URL and scope | `register-sw.ts` derives both from `import.meta.env.BASE_URL` |
| `manifest.webmanifest` | Copied verbatim from `public/`, so its paths are *relative* (`./`) and resolve against wherever the manifest lands |

`base` comes from `BASE_PATH`, which the workflow fills from
`actions/configure-pages`. That step therefore runs **before** the build, the opposite
of the usual ordering. It reports `/<repo>` for a project site and an empty string for
a custom domain, so `vite.config.ts` uses `||` rather than `??` — an empty string is
not nullish but does mean "serve from the root".

Two smaller details:

- **`dist/404.html` is a copy of `index.html`.** Pages has no rewrite rules, so a deep
  link 404s on a cold visit, before any service worker exists to serve the shell.
- **A worker's scope cannot extend above its own directory.** Registering `/sw.js` from
  a page at `/chat-buddy/` would fail twice over: the file is not there, and even if it
  were it could not control the app.

Verified by serving a `BASE_PATH=/chat-buddy/` build from a subpath: the worker
registered with scope `/chat-buddy/`, all 13 precached URLs carried the prefix, the
manifest's relative paths resolved correctly, and the app still worked with the server
stopped.

## Known gaps

The Prompt API and WebLLM code paths are written against the current
APIs but have only been exercised through the rule provider. Gemini Nano reported
`downloadable` rather than `available` on the development machine, and neither
multi-gigabyte download was triggered.
