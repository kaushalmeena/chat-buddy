<div align="center">

# Chat Buddy

[![License: MIT](https://img.shields.io/badge/License-MIT-3DA639?logo=opensourceinitiative&logoColor=white)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![Preact](https://img.shields.io/badge/Preact-10-673AB8?logo=preact&logoColor=white)](https://preactjs.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Biome](https://img.shields.io/badge/Biome-2-60A5FA?logo=biome&logoColor=white)](https://biomejs.dev/)

**A chat companion whose language model runs entirely in your browser.**

No API keys, no accounts, no server. Nothing you type leaves your device.

</div>

---

## How it works

Chat Buddy talks to whichever inference engine your browser can actually offer,
picked in order of preference:

| Engine | Model | Cost | Availability |
| --- | --- | --- | --- |
| **Chrome built-in AI** | Gemini Nano | Nothing — the weights ship with the browser | Chrome 148+ on desktop, with the disk and RAM headroom Chrome requires |
| **Local model** | Llama 3.2 1B via [WebLLM](https://webllm.mlc.ai/) | One-time ~950 MB download, then fully offline | Any browser with WebGPU |
| **Built-in rules** | A small hand-written knowledge base | Nothing | Everywhere, including offline |

The rule engine is the floor, not a fallback of last resort. No in-browser
language model has reach you can rely on, so something has to answer on a phone,
in Safari, and with no network — and that something ships in the app shell.

WebLLM is never enabled for you. A several-hundred-megabyte download is a
decision for the person using the app, so it sits behind an explicit opt-in and
lives in its own lazily-imported chunk. Visitors who never turn it on never
download a byte of it.

## Features

- **Real conversations** — a scrolling transcript with token-by-token streaming,
  stop, retry and copy.
- **Threads that persist** — conversations survive a reload, titled from their
  first message.
- **Slash commands** — type `/` for `/new`, `/clear`, `/retry`, `/speak`,
  `/light` and `/dark`, with arrow-key selection.
- **Voice in and out** — dictate with the Web Speech API and have replies read
  back aloud.
- **Light and dark themes** — with `system` as a first-class choice that tracks
  your OS live.
- **Installable and offline** — a Workbox service worker precaches the app shell,
  so the rule engine works with no network at all.
- **Accessible** — a `role="log"` transcript with polite announcements, real
  radio inputs for theming, visible focus rings, and full
  `prefers-reduced-motion` support.

## Tech stack

| Area | Choice |
| --- | --- |
| **Build** | [Vite 8](https://vite.dev/) |
| **Language** | [TypeScript 7](https://www.typescriptlang.org/), `strict` plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` |
| **UI** | [React 19](https://react.dev/) |
| **State** | [Zustand](https://zustand.docs.pmnd.rs/) with selector-based subscriptions |
| **Storage** | [Dexie](https://dexie.org/) over IndexedDB |
| **Animation** | [Motion](https://motion.dev/) |
| **Streaming** | [llm-ui](https://llm-ui.com/) for frame-rate-paced reveal |
| **Markdown** | [react-markdown](https://github.com/remarkjs/react-markdown) + [remark-gfm](https://github.com/remarkjs/remark-gfm) |
| **Styling** | [Tailwind CSS 4](https://tailwindcss.com/), CSS-first tokens |
| **Icons** | [lucide-react](https://lucide.dev/), imported per icon |
| **Lint & format** | [Biome 2](https://biomejs.dev/) |
| **Tests** | [Vitest](https://vitest.dev/) |
| **PWA** | [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) with Workbox |

## Getting started

You need [Node.js](https://nodejs.org/) 20.19 or newer.

```bash
git clone https://github.com/kaushalmeena/chat-buddy.git
```

```bash
cd chat-buddy && npm install && npm run dev
```

The app runs at [localhost:5173](http://localhost:5173/).

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Typecheck, then build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run verify` | Lint, typecheck and test — what CI runs |
| `npm run lint:fix` | Apply Biome's safe fixes |
| `npm run test:watch` | Vitest in watch mode |
| `npm run icons` | Regenerate PWA icons from the SVG brand source |

## Architecture

```
src/
├── domain/      Types only — messages, conversations, the provider contract
├── engine/
│   ├── providers/   One ChatProvider per inference backend, plus the tiering
│   ├── rules/       The built-in knowledge base and its matcher
│   └── skills/      Registry for structured capabilities (see below)
├── state/       Zustand stores plus the Dexie/IndexedDB layer
├── ui/          React components, hooks and the markdown renderers
├── lib/         Small shared utilities
└── types/       Ambient declarations for APIs missing from TypeScript's DOM lib
```

Tests live in a `__tests__` folder beside the code they cover. Components declare
their functions normally and export once at the bottom of the file.

Three seams are worth knowing about.

**`ChatProvider`** ([`src/domain/provider.ts`](src/domain/provider.ts)) is what
makes three very different backends interchangeable. Every implementation
streams — even the rule engine, which replays its canned reply a word at a time
— so the UI has one code path for "tokens are arriving" and adding a fourth
engine touches nothing else.

**Streaming is two separate jobs**, deliberately kept apart.
[`chunk-batcher.ts`](src/lib/chunk-batcher.ts) buffers arriving text outside React
and commits one store write per animation frame — a performance concern, so a
model emitting 60 tokens a second costs one render rather than 60. Then
[`streamed-markdown.tsx`](src/ui/render/streamed-markdown.tsx) decides how fast
that text is *revealed*, using llm-ui's frame-rate throttle plus
`markdownLookBack`, which walks back to a boundary that renders cleanly so partial
output never flashes half-parsed syntax. Neither layer has to compromise: the
batcher never withholds text, and the renderer never guesses at network timing.

**`SkillRegistry`** ([`src/engine/skills/registry.ts`](src/engine/skills/registry.ts))
is where structured capabilities plug in: a skill returns a typed `Attachment`
rather than markup, so the UI decides how to render and a skill cannot inject
HTML. It ships empty. To add one, implement `Skill`, add its `Attachment`
variant, render that variant, and register it.

### Adding to the knowledge base

Rules live in [`src/engine/rules/rules.ts`](src/engine/rules/rules.ts) as a typed
array. Order matters — the first match wins, so keep specific patterns above
general ones and leave the catch-all last.

```ts
{
  id: "gratitude",
  patterns: ["\\b(thanks|thank you)\\b"],
  replies: ["Any time.", "You're welcome!"],
}
```

Patterns are compiled once at module load. Anchor them with `\b` unless you mean
to match inside words: a bare `cat` also matches "concatenate".

## Privacy

Replies are generated on your device by every engine listed above. There is no
backend, no analytics and no account. Conversations are stored in
`localStorage` and never sent anywhere.

One exception worth stating plainly: **voice input is not local.** Chrome's
`SpeechRecognition` sends audio to Google's speech service. Dictation is
therefore the one feature that leaves your device — everything else, including
the text-to-speech that reads replies back, runs locally.

## Contributing

Contributions are welcome. Please
[open an issue](https://github.com/kaushalmeena/chat-buddy/issues/new/choose)
before starting on anything substantial. Run `npm run verify` before opening a
pull request.

## License

MIT — see [LICENSE](LICENSE).
