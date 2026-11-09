# Layout and components

## Layout

A two-column shell: sidebar plus conversation.

**The sidebar holds threads only** — New chat, search, and threads grouped by recency
(Today, Yesterday, Previous 7/30 days, Older). Engine, voice and theme live in the
**settings dialog**, a native `<dialog>` opened from the sidebar, the engine badge in
the header, or `/settings`.

**Above `lg` (1024px)** the sidebar is persistent and collapsible via a `width`
transition; `inert` keeps hidden contents out of the tab order. **Below `lg`** it is a
drawer that stays mounted and slides with a transform.

The header shows the active thread's title and an engine badge that doubles as a
download progress indicator.

Heights use `dvh`, not `vh`, so mobile browser chrome does not crop the composer.

## No layout shift

- The transcript renders nothing until IndexedDB has answered, so a returning visitor
  never sees the empty state flash before their history.
- Markdown is lazy-loaded (`RichText`) but its chunk is fetched in parallel with the
  IndexedDB read from `main.tsx`, so stored replies render formatted on first paint.
- Message actions are rendered invisibly while a reply streams, reserving their row.
- The transcript uses `scrollbar-gutter: stable` so a growing reply never nudges the
  content sideways.
- Skeletons (engine badge, engine list) match the size of what replaces them.

## Components

### Messages

User messages are right-aligned bubbles on the brand gradient. Assistant replies sit on
the canvas at full measure beside the brand mark — long formatted answers read better
unboxed. Each reply carries copy, retry (last reply only) and the engine that produced
it; on wide screens the actions on older replies appear on hover or focus.

**There is no streaming caret.** Text arriving at a steady pace is itself the signal.

Failed replies show the error in a danger-tinted panel. Stopped replies keep their
partial text and are labelled `stopped`.

### Transcript

`role="log"` with `aria-live="polite"` and `aria-relevant="additions"`. Auto-scroll
follows new content only while the view is near the bottom; once disengaged, a "jump to
latest" button fades in.

### Composer

A card: auto-growing textarea (capped at 200px, scrolling only beyond it) above a
toolbar with read-aloud, dictation and send/stop. Enter sends, Shift+Enter inserts a
newline, Enter during IME composition is ignored. Typing `/` opens the command menu.
Ctrl/Cmd+Shift+O starts a new chat from anywhere.

### Provider picker

Each engine shows label, description, and an availability chip: download size, WebGPU
requirement, or browser requirement. Unavailable engines are visibly disabled rather
than hidden.

## Accessibility

Commitments, not aspirations:

- **One focus style everywhere** — 2px `brand-500` outline at 2px offset, via a single
  `:focus-visible` rule. Never removed without replacement.
- **Native controls where they exist.** The theme switcher is a `<fieldset>` of radio
  inputs, not buttons with `role="radio"`, because native radios bring arrow-key
  navigation and a single tab stop for free.
- **Icon-only controls always have an accessible name.**
- **Destructive actions stay keyboard-reachable.** Thread delete buttons are hidden
  until hover _or_ `focus-visible`, never hover alone.
- **`prefers-reduced-motion` is fully honoured.**
- **ARIA that fits the element.** `aria-expanded` is not valid on a textbox, and giving
  the composer `role="combobox"` to accept it would cost its multiline semantics — so a
  live region does the announcing instead. Correct ARIA beats idiomatic-looking ARIA.
- **Colour is never the only signal.** The active engine has a checkmark, not just a
  tint; errors have an icon, not just red text.

## Adding to the system

1. **Use existing tokens.** If you need a colour that is not there, add a semantic
   token to both theme blocks rather than a one-off value.
2. **Avoid arbitrary values** (`text-[13px]`) unless the scale genuinely lacks it. The
   few in use are deliberate and commented.
3. **Match the motion table.** Springs for spatial change, short ease-outs for
   appearance.
4. **Check both themes**, and check with reduced motion on.
5. **Tab through it.** Focus visible, order sensible, nothing reachable that should not
   be, nothing unreachable that should.
