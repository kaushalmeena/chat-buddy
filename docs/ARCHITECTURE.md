# Architecture

How Chat Buddy is put together, and why. This documents the decisions that are not
obvious from reading the code — the ones where a reasonable person would have done
something else, and the reason we did not.

## Contents

- [The shape of the app](#the-shape-of-the-app)
- [Layers](#layers)
- [The provider seam](#the-provider-seam)
- [Provider tiering](#provider-tiering)
- [Streaming is two separate jobs](#streaming-is-two-separate-jobs)
- [State](#state)
- [Persistence](#persistence)
- [The rule engine](#the-rule-engine)
- [The skill registry](#the-skill-registry)
- [Speech](#speech)
- [Build and bundle](#build-and-bundle)
- [Conventions](#conventions)
- [Dependency pins](#dependency-pins)
- [Known gaps](#known-gaps)

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

## The provider seam

[`ChatProvider`](../src/domain/provider.ts) is the interface that makes three very
different inference backends interchangeable:

```ts
type ChatProvider = {
  readonly id: ReplySource;
  readonly label: string;
  readonly description: string;
  readonly isLocal: boolean;

  availability(): Promise<ProviderAvailability>;
  prepare(onProgress?: (progress: DownloadProgress) => void): Promise<void>;
  generate(options: GenerateOptions): AsyncIterable<string>;
  dispose(): Promise<void>;
};
```

Three things about this are deliberate.

**Everything streams, including the rule engine.** The rule provider has its whole
answer available immediately, but it still yields word by word. Having one output
shape means the UI has exactly one code path for "text is arriving" — the stop
button, the typing indicator and the batching all work identically regardless of
which backend answered. The alternative, a `generate` that sometimes returns a
string and sometimes an iterable, pushes a branch into every consumer.

**`availability()` is separate from `prepare()`.** Asking whether a provider *could*
work must not download 950 MB to find out. Availability is a cheap probe; preparing
is the expensive commitment. Splitting them is what lets the UI show download sizes
and hardware requirements *before* someone opts in.

**`AbortSignal` is the only cancellation mechanism.** Implementations must treat it
as authoritative and stop yielding promptly. Some providers throw on abort, some
return cleanly — [`ChatEngine`](../src/engine/chat-engine.ts) handles both by
checking the signal rather than relying on an exception.

Adding a fourth backend means writing one class and adding it to
[`provider-registry.ts`](../src/engine/providers/provider-registry.ts). Nothing in
`components/` or `stores/` changes.

## Provider tiering

Providers are ordered by preference in
[`provider-registry.ts`](../src/engine/providers/provider-registry.ts):

| Order | Provider | Cost | Reach |
| --- | --- | --- | --- |
| 1 | `PromptApiProvider` — Chrome's Gemini Nano | Free; weights ship with the browser | Chrome 148+ desktop, with disk and RAM headroom |
| 2 | `WebLlmProvider` — Llama 3.2 1B on WebGPU | ~950 MB one-time download | Any browser with WebGPU |
| 3 | `LocalRuleProvider` — the built-in rule table | Free | Everywhere, including offline |

**The rule provider is the floor, not a fallback of last resort.** No in-browser
language model has reach you can rely on, so something has to answer on a phone, in
Safari, and with no network. That something ships inside the app shell, which is
also what makes the PWA genuinely useful offline.

**WebLLM is never auto-selected.** `selectDefaultProvider` only picks a provider
whose availability is `ready` — never one that is `needs-download`. A
several-hundred-megabyte download is a decision for the person using the app.

**A stored provider preference is only honoured if it is still `ready`.** Otherwise
someone who enabled WebLLM once would re-trigger the download on every single visit
before the UI appeared.

**Every turn gets an answer.** `resolveProvider` in
[`chat.ts`](../src/stores/chat.ts) waits on startup probing rather than
bailing out, and falls back to the rule provider if probing failed. This was a real
bug: sending a message before probing finished appended the message and then
silently answered nothing.

## Streaming is two separate jobs

This is the least obvious part of the codebase and the most worth understanding.
Smooth streaming is two problems that look like one, and conflating them means
neither gets solved properly.

**Job one: not melting React.** A model emitting 60 tokens a second would drive 60
store writes and 60 re-renders a second if each chunk committed immediately.
[`chunk-batcher.ts`](../src/lib/chunk-batcher.ts) buffers arriving text *outside*
React entirely and commits once per animation frame. Cost becomes one render per
frame regardless of token rate. It never withholds text — it only batches writes.

**Job two: rhythm.** Models do not emit at a constant rate. WebGPU inference arrives
in clumps as batches finish; Chrome's Prompt API can hand over a whole sentence at
once after a pause. Committing each chunk the moment it lands makes text lurch — a
paragraph appears, nothing happens, three words appear.
[`StreamedMarkdown.tsx`](../src/components/StreamedMarkdown.tsx) solves this with
[llm-ui](https://llm-ui.com/)'s `useLLMOutput`, which keeps its own buffer and
reveals from it at display frame rate, speeding up or slowing down to hold the
buffer near a target size.

Keeping them apart means neither compromises: the batcher never delays text to make
it look smoother, and the renderer never has to reason about network timing.

`markdownLookBack` is the piece that makes the second job safe for markdown.
Revealing a raw prefix would flash half-parsed syntax — a lone `**` before its
closing pair, a table with one cell. The look-back function walks back to the
nearest boundary that renders cleanly.

Settled messages bypass llm-ui entirely and render through
[`Markdown.tsx`](../src/components/Markdown.tsx) directly. There is nothing left to
pace, and routing history through the hook would re-animate old replies on mount.

## State

[Zustand](https://zustand.docs.pmnd.rs/), with selector-based reads.

The hot path is appending text to one message many times a second. A selector means
only components reading the changed slice re-render — `useChat((s) => s.isGenerating)`
does not re-render when message text changes.

Two rules follow from that:

**Selectors must not allocate.** A selector returning a fresh array or object every
call re-renders on every store write, defeating the point. Sorting and filtering
happen in `useMemo` inside components (see
[`ThreadList.tsx`](../src/components/ThreadList.tsx)), not in selectors.

**Shared selectors are exported.** `selectActiveConversation` and `selectMessages`
live in the store so no component inlines a slice expression and accidentally
allocates.

The transcript is treated as immutable. Every update produces new objects, which
keeps retry, history and persistence straightforward and makes memoisation
trustworthy.

Actions are plain exported functions (`sendMessage`, `retryLastReply`,
`stopGenerating`) rather than methods on the store. They are not reactive, so they
have no reason to live inside it, and importing a function is easier to trace than
reaching through a hook.

## Persistence

Two stores, deliberately different.

**Threads → IndexedDB via [Dexie](https://dexie.org/)**
([`conversations.ts`](../src/db/conversations.ts)). Writes are asynchronous so streaming a
long reply never blocks the main thread; the quota is hundreds of megabytes rather
than five; and structured values are stored without a `JSON.stringify` round-trip.
It also leaves room for attachments to carry binary payloads later without changing
the storage layer.

**Preferences → `localStorage` via zustand `persist`**
([`config.ts`](../src/stores/config.ts)). These are a handful of
scalars that must be readable *synchronously before first paint* — the inline script
in `index.html` reads the theme to avoid a white flash on a dark-mode reload. That
is precisely what an async store cannot offer.

Two details worth knowing:

**Streaming writes skip persistence.** Saving on every frame would mean hundreds of
IndexedDB transactions per reply. The turn is written once when it settles.

**Persisted data is validated on read.** Rows may have been written by an older
build, hand-edited in devtools, or left half-written by a failed transaction. Every
field is checked before it re-enters the typed domain model. `normalise` also repairs
states that cannot exist at rest: a thread saved mid-generation would otherwise
reload with a message stuck in `streaming`, waiting on a stream that no longer
exists.

## The rule engine

The knowledge base is a typed array in
[`rules.ts`](../src/engine/rules/rules.ts). It replaced a `brain.xml` file parsed at
runtime with jQuery.

```ts
{
  id: "gratitude",
  patterns: ["\\b(thanks|thank you)\\b"],
  replies: ["Any time.", "You're welcome!"],
}
```

Moving it into TypeScript bought three things: the shape is checked at build time,
patterns compile once at module load instead of on every message, and the table is
tree-shaken into the bundle with no runtime fetch or `DOMParser` pass.

**Order matters** — the first match wins. Keep specific patterns above general ones
and leave the catch-all last.

**Anchor patterns with `\b`** unless you mean to match inside words. The original XML
used bare substrings, so `cat` also matched "concatenate" and `hi` matched "this".

`matchRule` takes an injectable random source so reply selection is deterministic in
tests without stubbing globals.

## The skill registry

[`SkillRegistry`](../src/engine/skills/registry.ts) is where structured capabilities
plug in. **It ships empty** — it is the seam, not a feature.

It replaced numeric action codes (`101`–`108`) where the meaning of a reply lived in
a `switch` statement and every branch wrote remote strings straight into
`innerHTML`. Skills return a typed `Attachment` instead, so the UI decides how to
render and a skill cannot inject markup.

To add one: implement `Skill`, add its `Attachment` variant in
[`message.ts`](../src/domain/message.ts), render that variant in the attachment
renderer, and register it.

## Speech

Both halves use the Web Speech API, and they are not equivalent on privacy.

**Output (synthesis) is local** in every current browser. Three things make it work
properly:

- `getVoices()` returns an empty array on the first call in every browser. The list
  arrives asynchronously via `voiceschanged`, so `loadVoices()` awaits it. Reading it
  synchronously is why no voice was selected at all and the engine fell back to its
  own default.
- Markdown is converted to prose first. Passing raw markdown made the synthesiser
  read hashes, asterisks, table pipes and full URLs aloud.
- macOS ships ~19 novelty voices (`Zarvox`, `Bubbles`, `Trinoids`, `Bad News`) in the
  *same list* as real ones with no distinguishing flag. They are excluded from
  automatic selection.

**Input (recognition) is not local.** Chrome's `SpeechRecognition` sends audio to
Google's speech service. This is the one feature in the app that leaves the device,
and the UI says so rather than implying otherwise.

## Build and bundle

**Vendor chunks are split by package boundary.** `manualChunks` in
[`vite.config.ts`](../vite.config.ts) matches full package names, not prefixes —
`react` as a prefix also matches `react-markdown`, which quietly pulled the whole
micromark/mdast parser stack into the chunk labelled "react".

**The WebLLM engine is excluded from the service worker precache.** It is a ~6 MB
chunk most visitors never load, and the weights it fetches are hundreds of megabytes
more, cached by the engine itself. Precaching any of it would make a first visit pay
for a feature nobody opted into.

**`chunkSizeWarningLimit` is set above the WebLLM chunk.** A warning that fires on
every build is one everyone learns to scroll past.

Approximate gzipped initial load: React ~57 kB, markdown pipeline ~54 kB, motion
~41 kB, app code ~50 kB. The WebLLM chunk (~2.1 MB gzipped) is lazy and loads only
on opt-in.

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
- **`npm run verify`** runs lint, typecheck and tests. It is what CI runs.

## Dependency pins

Two `overrides` in `package.json` exist for reasons worth recording.

**`@babel/plugin-transform-runtime` is pinned to `^7.29.0`.** This is what lets
`@vitejs/plugin-react` — the Babel plugin, which Vite 8 recommends over SWC under
Rolldown — coexist with `vite-plugin-pwa`. Left alone, npm resolves that package to
8.x, which requires `@babel/core@8`, while `workbox-build` pins `@babel/core@7`; the
install fails outright with `ERESOLVE`. `@rolldown/plugin-babel` accepts either major,
so pinning it to 7 puts the whole tree on one Babel and needs no `--legacy-peer-deps`.

Worth revisiting once `workbox-build` supports Babel 8, at which point the pin can go.

**`@llm-ui/react` peer-depends on React 18**, not 19, so `react` is overridden to
match the installed version. It works, but it is an unsupported combination and worth
re-checking when llm-ui updates.

## Known gaps

The Prompt API and WebLLM code paths are written against the current
APIs but have only been exercised through the rule provider. Gemini Nano reported
`downloadable` rather than `available` on the development machine, and neither
multi-gigabyte download was triggered.
