import type { JSX } from "preact";
import { useId } from "preact/hooks";

type BrandMarkProps = {
  readonly size?: number;
  readonly class?: string;
};

/**
 * The Chat Buddy mark, inlined as SVG rather than loaded as an image.
 *
 * Inline means no request, no layout shift, and gradient stops that can be tuned
 * alongside the theme. The same artwork lives in `src/assets/brand-icon.svg`,
 * which is the source `scripts/generate-icons.mjs` renders the PWA icons from.
 */
export function BrandMark({
  size = 32,
  class: className,
}: BrandMarkProps): JSX.Element {
  /*
   * The gradient id must be unique per instance.
   *
   * SVG paint references are document-scoped, not element-scoped: with a
   * hard-coded id, every mark on the page would resolve `url(#...)` to whichever
   * definition came first in document order. When that first one happened to sit
   * inside the `display:none` sidebar, the gradient failed to paint and the mark
   * rendered as a bare white bubble.
   */
  const gradientId = `brand-field-${useId()}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      class={className}
      role="img"
      aria-label="Chat Buddy"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#818cf8" />
          <stop offset="0.55" stop-color="#6366f1" />
          <stop offset="1" stop-color="#7c3aed" />
        </linearGradient>
      </defs>

      <rect width="512" height="512" rx="116" fill={`url(#${gradientId})`} />

      {/* Speech bubble. */}
      <path
        fill="#ffffff"
        d="M256 116c-79.5 0-144 52.4-144 117 0 36.5 20.6 69 52.9 90.4 2.6 1.7 4 4.7 3.6 7.8l-6.6 48.2c-.8 6 5.8 10.2 10.9 6.9l58.8-37.8a10 10 0 0 1 6.9-1.5c5.7.8 11.6 1.2 17.5 1.2 79.5 0 144-52.4 144-117s-64.5-115.2-144-115.2z"
      />

      {/* Three dots: a reply in progress. */}
      <g fill={`url(#${gradientId})`}>
        <circle cx="198" cy="238" r="21" />
        <circle cx="256" cy="238" r="21" />
        <circle cx="314" cy="238" r="21" />
      </g>
    </svg>
  );
}
