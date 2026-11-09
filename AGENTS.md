# Chat Buddy

A static site that runs its language model in the browser. No backend, no API route,
no build-time secret — inference, storage and speech all happen on the device.

## Toolchain

Plain Vite 8 builds and serves the app; Vitest runs the tests. Oxlint lints (with the
`oxlint-tailwindcss` plugin reading `src/styles/global.css` as the design system, and
type-aware rules via `oxlint-tsgolint`), and Oxfmt formats and sorts Tailwind classes.
Config lives in `.oxlintrc.json` and `.oxfmtrc.json`.

`npm run check` runs typecheck, lint and format check — it is the gate CI runs.
Commands live in `package.json`.

## Reading the codebase

Start with [`docs/overview.md`](docs/overview.md) for the layer map and what each
folder owns. Then follow the work:

| Working on                                           | Read                                  |
| ---------------------------------------------------- | ------------------------------------- |
| Inference backends, streaming, token batching        | [providers.md](docs/providers.md)     |
| Stores, persistence, the rule engine, skills, speech | [state.md](docs/state.md)             |
| Components, layout, accessibility                    | [components.md](docs/components.md)   |
| Colour, theming, typography, spacing                 | [foundations.md](docs/foundations.md) |
| Animation, iconography, the brand mark               | [motion.md](docs/motion.md)           |
| Bundling, the service worker, deployment             | [build.md](docs/build.md)             |

## Conventions

**Dependencies point inwards.** `domain` imports nothing from `src`; `engine` imports
`domain`; `db` and `stores` import `domain` and `engine`; `components` and `hooks`
import all of them. Nothing imports a component. No tooling enforces this — the moment
`domain` imports from a store, the types stop being a shared vocabulary and become a
dependency knot.

**`lib/` stays app-agnostic.** Anything that knows what a `Conversation` is belongs
elsewhere.

**Tests import from `vitest`.** Tests sit in a `__tests__` folder
beside the code they cover.

**Optional keys are omitted, not set to `undefined`.** `exactOptionalPropertyTypes` is
on, so `{ foo: undefined }` and `{}` are different types.

**`worker/` runs without a DOM.** It aliases `self` rather than relying on the ambient
globals the rest of the app has, and nothing in `src` imports it.

**WebLLM is an optional dependency.** Treat it as absent: it is a ~6 MB chunk most
visitors never load, excluded from the service worker's precache, and the provider
registry already tiers around it being unavailable.

## Gotchas

`BASE_PATH` decides where the app is served from, and the build bakes it into asset
URLs, the service worker's precache list and its scope. Leave it unset for local work.

Oxlint reports a handful of pre-existing React Compiler warnings about refs during
render. They are warnings, not errors, and do not fail the gate.
