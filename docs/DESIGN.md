# Design

The visual and interaction system behind Chat Buddy: the tokens, the rules they
encode, and the reasoning for the choices that are easy to get wrong.

## Contents

- [Principles](#principles)
- [Colour](#colour)
- [Theming](#theming)
- [Typography](#typography)
- [Shape and spacing](#shape-and-spacing)
- [Motion](#motion)
- [Iconography](#iconography)
- [The brand mark](#the-brand-mark)
- [Layout](#layout)
- [Components](#components)
- [Accessibility](#accessibility)
- [Adding to the system](#adding-to-the-system)

## Principles

**State what the device can do, before it matters.** The interesting failures here
are all about hardware: no WebGPU, not enough disk, wrong browser. The provider
picker names download sizes and requirements up front, because finding out after a
950 MB download is the wrong time.

**Say where the data goes.** The app's whole premise is that nothing leaves the
device, so the UI repeats it where it is relevant — under the composer, on the empty
state — and is equally explicit about the one exception (dictation).

**Never animate a state change the user did not initiate.** Motion is for transitions
someone caused. A theme swap is instant; a message arriving eases in.

**Discoverability over cleverness.** The original app expected people to guess which
bare keywords it recognised. Suggested prompts and a slash-command menu replace
guessing.

## Colour

All colours are declared as `--color-*` custom properties inside `@theme` in
[`global.css`](../src/styles/global.css), which makes Tailwind generate matching
utilities (`bg-surface`, `text-content-muted`, `border-border-subtle`).

Values are in **OKLCH**, not hex. OKLCH is perceptually uniform, so a lightness step
looks like the same size step regardless of hue — which is what makes a light and a
dark palette feel like siblings rather than two unrelated designs.

### Semantic tokens

Named by *role*, never by appearance. There is no `--color-gray-200`, because the
whole point is that the same token resolves to a light value in one theme and a dark
one in the other.

| Token | Role |
| --- | --- |
| `canvas` | Page background, behind everything |
| `surface` | Cards, bubbles, inputs — one step off the canvas |
| `surface-raised` | Hover states, code blocks, table headers |
| `border-subtle` | Default borders and dividers |
| `border-strong` | Hover borders, scrollbar thumbs |
| `content` | Primary text |
| `content-muted` | Secondary text, descriptions |
| `content-faint` | Metadata, labels, placeholders |
| `danger` | Errors and destructive actions |
| `success` | The active-engine indicator |

### Brand ramp

`brand-50` through `brand-700`, indigo/violet at hue 285. In practice only a few are
used: `brand-500` for accents and focus rings, `brand-600` for the send button and
user bubbles, `brand-400` for hover borders.

Brand colours are **theme-independent** — they sit in the shared `@theme` block, not
the per-theme ones, because an accent that shifts between themes stops reading as a
brand.

## Theming

A `dark` class on `<html>` selects the palette — Tailwind's own class-based dark
mode convention, registered in [`global.css`](../src/styles/global.css):

```css
@custom-variant dark (&:where(.dark, .dark *));
```

The `:where()` wrapper keeps the variant at zero specificity, so a `dark:` utility
never silently outranks an unprefixed one declared later.

Registering the variant means `dark:` utilities work exactly as they do in any
Tailwind project. They should stay the exception, though: the palette is a **pure
token swap**, so almost nothing needs a `dark:` prefix. Reach for one only when a
property genuinely differs per theme rather than merely resolving to a different
token — an image opacity, say.

Four details make it behave:

**Resolved before first paint.** A small inline script in
[`index.html`](../index.html) reads the stored preference and toggles the class
before the bundle loads. Without it, a dark-mode reload flashes a white canvas.

**`system` is a first-class choice**, not just an initial value, and it tracks the OS
live via `matchMedia`. Someone who pinned a theme once can go back to following their
system.

**Transitions are suppressed during the swap.** This one is worth spelling out.
Utilities like `transition-colors` exist for hover and focus, but they *also* apply
when the underlying custom property changes — so flipping the theme animated hundreds
of elements from their old colour to their new one at once. Because the palettes sit
at opposite ends of the lightness range, those interpolations swept through dark
intermediate values and read as a **black flash** across the UI.

The fix: `startThemeSync` stamps `data-theme-switching` for two frames, and CSS kills
every transition while it is present. A theme change should be instantaneous; only
deliberate interaction states should animate.

```css
:root[data-theme-switching],
:root[data-theme-switching] * {
  transition: none !important;
}
```

That flag is a data attribute rather than a second class deliberately — it is a
transient state marker, not a style hook, and keeping it out of `class` leaves `dark`
as the only class the theme system touches.

## Typography

One family: **Inter** where available, falling back to the system UI stack. One mono
stack for code.

| Context | Size | Notes |
| --- | --- | --- |
| Message body | `0.9375rem` (15px) | Between Tailwind's `sm` and `base`; 14px is too tight for sustained reading, 16px too loose in a bubble |
| Section labels | `0.75rem` uppercase, tracked | Sidebar headings |
| Metadata | `0.6875rem` (11px) | Message footers, availability notes |
| Code | `0.8125rem` | Blocks; inline code is `0.875em` so it scales with its parent |

Message prose uses `line-height: 1.65` and `overflow-wrap: anywhere` — the latter
because model output contains unbroken strings that would otherwise widen a bubble
past its container.

Prose styling is scoped to a single `.message-prose` class rather than pulled in via
the typography plugin, so the tokens above stay authoritative. Headings inside
messages are **capped in size**: a model emitting `#` means "this is a heading", not
"render this at hero scale".

## Shape and spacing

Spacing is Tailwind's default 4px scale. Two custom values:

- `--radius-bubble: 1.125rem` — message bubbles, with the corner nearest the sender
  tightened to `rounded-br-md` / `rounded-bl-md`. That asymmetry is what makes a
  bubble read as belonging to a side without needing a tail.
- Controls use `rounded-lg`; pills and the composer use `rounded-full` /
  `rounded-3xl`.

Bubbles cap at `min(42rem, 85%)`. A measure much wider than 42rem is hard to read;
85% keeps the sender's side visible.

## Motion

[Motion](https://motion.dev/) for anything stateful, CSS for anything continuous.

| Movement | Treatment |
| --- | --- |
| Message entry | Fade + 8px rise, 0.24s, `cubic-bezier(0.22, 1, 0.36, 1)` |
| Sidebar collapse | Spring, stiffness 380, damping 34 |
| Drawer | Spring, stiffness 420, damping 38 |
| Theme indicator | Spring via shared `layoutId` |
| Menus, badges | 0.16–0.22s ease-out |
| Typing dots, indeterminate progress | CSS keyframes — continuous, so no JS |
| Button press | `whileTap` scale 0.92 |

The easing curve is a decelerating ease-out: fast to start, settling gently. It reads
as responsive rather than floaty.

Two rules:

**Springs for anything that tracks a position** — a sliding indicator, a drawer, a
collapsing panel. Duration-based easing on a spatial change looks mechanical.

**`whileTap` only when the press will do something.** A disabled button that still
reacts to a tap reads as broken.

### Reduced motion

`prefers-reduced-motion: reduce` collapses every animation and transition to
0.01ms via a universal selector with `!important`. Both are deliberate: the
universal selector has to catch animations this file does not know about, and
`!important` has to beat a more specific rule elsewhere. An accessibility override
must win the cascade.

### Animation and clipping

Height-reveal animations need `overflow: hidden` while they run — but left in place it
also clips **focus rings**, which sit 4px outside an element (2px outline + 2px
offset). The voice picker drops the clipping once its animation settles. Anything that
animates height around a focusable element needs the same treatment.

## Iconography

[lucide-react](https://lucide.dev/), imported per icon so the bundle carries only what
is used — a few hundred bytes against the ~100 kB icon font this replaced.

Conventions:

- **20px** default, **13–17px** in dense contexts, **12px** in message footers.
- Icons beside a text label get `aria-hidden`. Icon-only buttons carry `aria-label`
  *and* `title`.
- Icons passed as props are typed as `IconComponent` in
  [`components/types.ts`](../src/components/types.ts) rather than lucide's own type, so component
  signatures are not coupled to the icon library.

Lucide 1.x removed brand icons, so there is no GitHub glyph — the repo link uses
`ExternalLink`.

Native form controls that ship their own indicator get `appearance-none` plus an
explicit chevron. Every engine positions the native `<select>` arrow differently and
none respect `padding-right` consistently, so it cannot be spaced reliably.

## The brand mark

A speech bubble with three dots — conversation plus a reply in progress — on an
indigo/violet gradient squircle.

One source of truth: [`brand-icon.svg`](../src/assets/brand-icon.svg).
`scripts/generate-icons.mjs` renders every PWA and favicon asset from it, and CI fails
if the committed icons drift from the source. The React component
[`BrandMark.tsx`](../src/components/BrandMark.tsx) inlines the same artwork —
inline means no request, no layout shift, and gradient stops that can be tuned
alongside the theme.

**Its gradient id is generated per instance with `useId`.** SVG paint references are
document-scoped, not element-scoped: with a hard-coded id, every mark on the page
resolves `url(#…)` to whichever definition comes first in document order. When that
one sat inside a hidden sidebar, the gradient failed to paint and the mark rendered
as a bare white bubble.

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
