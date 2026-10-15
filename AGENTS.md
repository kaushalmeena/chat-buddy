# Chat Buddy

A static site that runs its language model in the browser. No backend, no API route,
no build-time secret — inference, storage and speech all happen on the device.

## Toolchain

Vite+ (`vp`) is the entry point for every task. `vp check` formats, lints and
type-checks in one pass; it is the gate CI runs.

`vp <name>` runs a built-in command, `vp run <name>` runs a `package.json` script, and
a script never shadows a built-in — so `vp build` and `vp run build` can differ. Reach
for `vp run` when you mean the script.

Commands live in `package.json`. Vite+'s own docs are local, at
`node_modules/vite-plus/docs`.

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

**Tests import from `vite-plus/test`**, not `vitest`. Tests sit in a `__tests__` folder
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

`vp check` reports seven pre-existing React Compiler warnings about refs during render
and `setState` in an effect. They predate the Vite+ migration and do not fail the gate.

Run `vp install` after pulling, and `vp env doctor` when setup or runtime behaviour
looks wrong.
