# Overview

## The shape of the app

Chat Buddy is a static site. There is no backend, no API route, no build-time
secret. Everything — inference, storage, speech — happens in the browser.

That constraint drives most of what follows. With no server to normalise
behaviour, the app has to cope with browsers that differ enormously in what they
can do: one visitor has a language model built into Chrome, the next has WebGPU
but no built-in model, the next is on iOS Safari with neither. The architecture is
mostly about absorbing that variance without the UI having to know about it.

## Layers

```
src/
├── App.tsx        The app shell: layout, sidebar, drawer
├── main.tsx       Entry point. Starts subscriptions, mounts, registers the SW
├── commands.ts    Slash command registry
├── register-sw.ts Service worker registration (not the worker itself)
├── assets/        The SVG brand source
├── components/    React components, PascalCase filenames
├── db/            Dexie schema and conversation persistence
├── domain/        Types only. No imports from anywhere else in src
├── engine/        Inference and capabilities
│   ├── providers/   One ChatProvider per backend, plus tiering
│   ├── rules/       The built-in knowledge base and its matcher
│   └── skills/      Registry for structured capabilities
├── hooks/         React hooks, camelCase filenames
├── lib/           Small shared utilities with no app knowledge
├── stores/        Zustand stores
├── styles/        global.css: tokens, theme, prose
├── test/          Vitest setup
└── types/         Ambient declarations for APIs missing from TypeScript's DOM lib
```

One concern per folder, so the root view is readable at a glance. Two choices in
there are worth naming:

**`db/` is separate from `stores/`.** Persistence is infrastructure, not state. Keeping
them apart means `stores/` holds exactly the two Zustand stores — parallel in name and
in role — and swapping the storage engine touches one folder.

**`components/` and `hooks/` sit at the src root** rather than nested under a `ui/`
wrapper. With domain, engine and db already separating the non-visual layers, the
extra level bought nothing and cost a directory of depth on every import.

Dependencies point inwards. `domain` imports nothing from `src`; `engine` imports
`domain`; `db` and `stores` import `domain` and `engine`; `components` and `hooks`
import all of them. Nothing imports a component. This is not enforced by tooling — it
is a convention worth keeping, because the moment `domain` imports from a store, the
types stop being a shared vocabulary and become a dependency knot.

`lib` is deliberately app-agnostic: [`chunk-batcher.ts`](../src/lib/chunk-batcher.ts),
[`speech-text.ts`](../src/lib/speech-text.ts) and
[`speech-voices.ts`](../src/lib/speech-voices.ts) would work unchanged in any other
project. Anything that knows what a `Conversation` is belongs elsewhere.

Three folders sit outside `src`, all typechecked with everything else:

- **`worker/`** — the service worker. Outside `src` because `src` is what gets bundled
  and this is not: it runs in a worker global scope with no DOM, nothing in `src`
  imports it, and it is transpiled to `dist/sw.js` by its own pipeline. Verifiable
  rather than asserted — every identifier in it appears only in `dist/sw.js`, never in
  an `assets/*.js` chunk. That separation is also why the file opens by aliasing `self`
  instead of relying on the ambient DOM globals the rest of the app has.
- **`plugins/`** — Vite plugins. Currently just the service worker builder.
- **`scripts/`** — standalone CLI tools. Currently just the icon generator.
