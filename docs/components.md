# Layout and components

## Layout

A two-column shell: sidebar plus conversation.

**Above `lg` (1024px)** the sidebar is persistent and collapsible. Collapsing animates
`width` to zero rather than unmounting, so the transcript reflows in step with it and
the thread list keeps its scroll position across a collapse and expand. `inert` keeps
the hidden contents out of the tab order and the accessibility tree.

**Below `lg`** the same contents become an overlay drawer, dismissed by backdrop click
or Escape.

The wordmark moves into the header whenever the sidebar is not showing it, so the app
is never unlabelled.

Heights use `dvh`, not `vh`, so mobile browser chrome does not crop the composer.

## Components

### Message bubbles

User messages are right-aligned on `brand-600`; assistant messages are left-aligned on
`surface` with a border. Each assistant message carries a footer naming the engine that
produced it — with three interchangeable backends, which one answered is real
information.

**There is no streaming caret.** Text arriving at a steady pace is itself the signal
that generation is in progress, and a blinking block on the last character fights the
reading eye.

Failed messages replace the body with the error rather than showing an empty bubble.
Stopped messages keep their partial text and are labelled `stopped`.

### Transcript

`role="log"` with `aria-live="polite"` and `aria-relevant="additions"`, so new replies
are announced without stealing focus and without re-reading the whole transcript on
every committed slice.

Auto-scroll follows new content **only while the view is near the bottom**. Scrolling
up during a long reply is how you read it; a transcript that yanks itself back down
every frame is unusable. Once disengaged, a "jump to latest" button appears.

### Composer

Auto-growing textarea capped at 200px. Enter sends, Shift+Enter inserts a newline.
Typing `/` opens the command menu; arrows move, Tab or Enter accepts, Escape clears.

The menu is a plain list of real buttons, **not** a scripted listbox. Focus stays in
the textarea so typing keeps working, which rules out the listbox/option pattern — its
options must be focusable or referenced by `aria-activedescendant`. A visually hidden
live region announces the menu instead.

### Provider picker

Each engine shows label, one-line description, and an availability note: download
size, WebGPU requirement, or browser requirement. Unavailable engines are visibly
disabled rather than hidden — knowing *why* something is unavailable is more useful
than its absence.

## Accessibility

Commitments, not aspirations:

- **One focus style everywhere** — 2px `brand-500` outline at 2px offset, via a single
  `:focus-visible` rule. Never removed without replacement.
- **Native controls where they exist.** The theme switcher is a `<fieldset>` of radio
  inputs, not buttons with `role="radio"`, because native radios bring arrow-key
  navigation and a single tab stop for free.
- **Icon-only controls always have an accessible name.**
- **Destructive actions stay keyboard-reachable.** Thread delete buttons are hidden
  until hover *or* `focus-visible`, never hover alone.
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
