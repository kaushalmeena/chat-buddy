# State, persistence and features

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
