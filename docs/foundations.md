# Foundations

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
