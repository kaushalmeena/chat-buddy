# Motion and iconography

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
- Icons passed as props are typed as `LucideIcon`, imported from `lucide-react`. There
  was briefly a local alias for this, on the theory that it decoupled component
  signatures from the icon library. It did not buy anything: the alias was structurally
  identical to the real type, so a different icon set would have broken every call site
  regardless — and one more indirection is a real cost against a hypothetical saving.

Lucide 1.x removed brand icons, so there is no GitHub glyph — the repo link uses
`ExternalLink`.

Native form controls that ship their own indicator get `appearance-none` plus an
explicit chevron. Every engine positions the native `<select>` arrow differently and
none respect `padding-right` consistently, so it cannot be spaced reliably.

## The brand mark

A speech bubble with three dots — conversation plus a reply in progress — on an
indigo/violet gradient squircle.

One source of truth: [`brand-icon.svg`](../src/assets/brand-icon.svg).
`scripts/build-icons.mjs` renders every PWA and favicon asset from it. The outputs
are committed, so run `npm run icons` after editing the SVG — nothing checks this for
you. The React component
[`BrandMark.tsx`](../src/components/BrandMark.tsx) inlines the same artwork —
inline means no request, no layout shift, and gradient stops that can be tuned
alongside the theme.

**Its gradient id is generated per instance with `useId`.** SVG paint references are
document-scoped, not element-scoped: with a hard-coded id, every mark on the page
resolves `url(#…)` to whichever definition comes first in document order. When that
one sat inside a hidden sidebar, the gradient failed to paint and the mark rendered
as a bare white bubble.
