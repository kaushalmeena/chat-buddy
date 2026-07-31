# Providers and streaming

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

## Streaming is three separate jobs

This is the least obvious part of the codebase and the most worth understanding.
Smooth streaming is three problems that look like one, and conflating them means
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
[`useRevealedText`](../src/hooks/useRevealedText.ts) solves this by keeping a buffer
and releasing a slice of it per animation frame, sized from how much is waiting. A
small read-ahead reserve is held back so a pause between batches does not stall the
reveal, and a very large burst is shown at once rather than paced for seconds.

Keeping them apart means neither compromises: the batcher never delays text to make
it look smoother, and the renderer never has to reason about network timing.

**Job three: not rendering broken markdown.** Revealing a raw prefix flashes
half-written syntax — a lone `**` before its closing pair, a stray `[`, an open code
fence swallowing the rest of the message.
[`toRenderableMarkdown`](../src/lib/markdown-stream.ts) fixes each construct one of
two ways: an open fence gets a synthetic closing fence, so code streams line by line;
short constructs like emphasis and links are truncated at their opening marker and
reappear a frame later, already formatted.

Both replaced [llm-ui](https://llm-ui.com/), which did this job until it stopped being
maintained in early 2025 — and which peer-depended on React 18, forcing an npm
override to install beside React 19. The replacement is about 200 lines with 37 tests,
including one that walks every prefix length of a realistic reply and asserts no
unpaired marker ever escapes.

Settled messages bypass all of it and render through
[`Markdown.tsx`](../src/components/Markdown.tsx) directly. There is nothing left to
pace, and routing history through the hook would re-animate old replies on mount.
