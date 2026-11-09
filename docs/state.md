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
[`threads.tsx`](../src/components/threads.tsx)), not in selectors.

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
scalars that must be readable _synchronously before first paint_ — the inline script
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

## The built-in conversation engine

[`reply(turns)`](../src/engine/rules/reply.ts) is the whole interface: the transcript
in, one reply out. It replaced a table of eleven regexes (itself ported from a
`brain.xml` parsed with jQuery) that only ever saw the last message.

**It holds no state.** Everything that makes it feel like a conversation is re-read
from the transcript on every turn:

| Module                                         | Job                                                                                                       |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [`memory.ts`](../src/engine/rules/memory.ts)   | Learns facts from the person's messages: name, age, place, job, likes, dislikes, favourites, pets, mood   |
| [`reply.ts`](../src/engine/rules/reply.ts)     | Orchestrates, and owns the _flows_: replies that depend on what the engine itself just said               |
| [`intents.ts`](../src/engine/rules/intents.ts) | The intent table — recall, statements, small talk, fun — plus reflections and fallbacks                   |
| [`skills.ts`](../src/engine/rules/skills.ts)   | Things it can work out: arithmetic (a recursive-descent parser, never `eval`), time and date, dice, coins |
| [`corpus.ts`](../src/engine/rules/corpus.ts)   | Plain data: jokes, facts, riddles, would-you-rather, the persona's favourites                             |
| [`text.ts`](../src/engine/rules/text.ts)       | Normalising input (contractions, shorthand), pronoun reflection, no-repeat picking                        |

Because memory is derived, it is exactly as private and durable as the chat: clear
the thread and it is gone, and each thread remembers only itself.

**Order of precedence** in `reply`: open flows first (so "yes" after "Want another
joke?" gets a joke and an answer to a riddle is marked), then skills, then intents,
then ELIZA-style reflections ("I feel stuck" → "Why do you feel stuck?"), then a
fallback that suggests something that will work.

**Flows key off the engine's own words.** A riddle is open while the last reply
contains its question; an offer is open while the last reply ends with one of the
`OFFER_*` phrases. Change those strings and the flows follow automatically — they
are constants, not copies.

**No repeats.** Every choice prefers lines not yet said in this thread, so asking for
five jokes gets five different jokes.

**Within the intent table, order matters**: recall sits above statements, which sit
above small talk, so "what is my name" is never read as an introduction. An intent
whose `respond` returns `undefined` passes to the next one.

`reply` takes an injectable random source and clock, so the tests in
[`__tests__/reply.test.ts`](../src/engine/rules/__tests__/reply.test.ts) play whole
scripted conversations deterministically.

## Attachments

Assistant messages carry an `attachments` list, always empty today. It replaced the
original numeric action codes (`101`–`108`), where every branch wrote remote strings
straight into `innerHTML`: structured output is a typed value the UI renders, never
markup.

There was a `SkillRegistry` here, shipped empty as an extension point. It was removed:
a seam with no adapter is hypothetical, and nothing called it. When the first
structured capability arrives, add its `Attachment` variant in
[`message.ts`](../src/domain/message.ts) and build the seam around the real case.

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
  _same list_ as real ones with no distinguishing flag. They are excluded from
  automatic selection.

**Input (recognition) is not local.** Chrome's `SpeechRecognition` sends audio to
Google's speech service. This is the one feature in the app that leaves the device,
and the UI says so rather than implying otherwise.
