<div align="center">

<img src="public/icons/icon-192.png" alt="Chat Buddy" width="96" height="96" />

# Chat Buddy

[![License: MIT](https://img.shields.io/badge/License-MIT-3DA639?logo=opensourceinitiative&logoColor=white)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-087EA4?logo=react&logoColor=white)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

**A chat companion whose language model runs entirely in your browser.**

No API keys, no accounts, no server. Nothing you type leaves your device.

[**Try it live**](https://kaushalmeena.github.io/chat-buddy/)

</div>

---

## Features

- **Real conversations** — a scrolling transcript with frame-rate-paced streaming,
  stop, retry and copy.
- **Threads that persist** — conversations survive a reload, titled from their first
  message.
- **Slash commands** — type `/` for `/new`, `/clear`, `/retry`, `/speak`,
  `/collapse`, `/light`, `/dark` and `/system`.
- **Voice in and out** — dictate with the Web Speech API and have replies read back
  aloud, with a voice picker and preview.
- **Light and dark themes** — with `system` as a first-class choice that tracks your
  OS live.
- **Installable and offline** — a hand-written service worker precaches the app shell, so
  the rule engine works with no network at all.
- **Accessible** — a `role="log"` transcript, native form controls, visible focus
  rings, and full `prefers-reduced-motion` support.

## How It Works

Chat Buddy talks to whichever inference engine your browser can actually offer,
picked in order of preference:

| Engine | Model | Cost | Availability |
| --- | --- | --- | --- |
| **Chrome built-in AI** | Gemini Nano | Nothing — the weights ship with the browser | Chrome 148+ on desktop |
| **Local model** | Llama 3.2 1B via [WebLLM](https://webllm.mlc.ai/) | One-time ~950 MB download, then fully offline | Any browser with WebGPU |
| **Built-in rules** | A small hand-written knowledge base | Nothing | Everywhere, including offline |

The rule engine is the floor, not a fallback of last resort — no in-browser language
model has reach you can rely on, so something has to answer on a phone, in Safari,
and with no network. WebLLM is never enabled for you: a several-hundred-megabyte
download is a decision for the person using the app, so it sits behind an explicit
opt-in and lives in its own lazily-imported chunk.

## Tech Stack

| Area | Tools |
| --- | --- |
| **Framework** | [React 19](https://react.dev/) · [TypeScript 7](https://www.typescriptlang.org/) |
| **Build** | [Vite 8](https://vite.dev/) · a hand-written service worker, no PWA plugin |
| **Styling** | [Tailwind CSS 4](https://tailwindcss.com/) via its Vite plugin · [Motion](https://motion.dev/) · [Lucide](https://lucide.dev/) icons |
| **State** | [Zustand 5](https://zustand.docs.pmnd.rs/) · [Dexie 4](https://dexie.org/) over IndexedDB |
| **Inference** | [Chrome built-in AI](https://developer.chrome.com/docs/ai/built-in) · [WebLLM](https://webllm.mlc.ai/) as an optional dependency · a built-in rule engine |
| **Rendering** | [react-markdown](https://github.com/remarkjs/react-markdown) · [remark-gfm](https://github.com/remarkjs/remark-gfm) |
| **Tooling** | [Biome](https://biomejs.dev/) · [Vitest](https://vitest.dev/) with [jsdom](https://github.com/jsdom/jsdom) · [sharp](https://sharp.pixelplumbing.com/) for icons |
| **Deployment** | [GitHub Pages](https://pages.github.com/) via [GitHub Actions](https://github.com/features/actions) |

## Getting Started

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
| `npm run verify` | Lint, typecheck and test — the CI gate |
| `npm run icons` | Regenerate PWA icons from the SVG brand source |

## Documentation

- **[Architecture](docs/architecture.md)** — layers, the provider seam, how streaming
  and persistence work, and the compromises that are pinned rather than solved.
- **[Design](docs/design.md)** — colour and theming, typography, motion, and the
  accessibility commitments.

## Privacy

Replies are generated on your device by every engine listed above. There is no
backend, no analytics and no account. Conversations are stored in your browser's
IndexedDB and never sent anywhere.

One exception worth stating plainly: **voice input is not local.** Chrome's
`SpeechRecognition` sends audio to Google's speech service. Dictation is therefore
the one feature that leaves your device — everything else, including the
text-to-speech that reads replies back, runs locally.

## Contributing

Contributions are welcome. Please
[open an issue](https://github.com/kaushalmeena/chat-buddy/issues/new/choose) before
starting on anything substantial, and run `npm run verify` before opening a pull
request.

## License

MIT — see [LICENSE](LICENSE).
