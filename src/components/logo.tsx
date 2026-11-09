import { useId } from "react";

type BrandMarkProps = {
  readonly size?: number;
  readonly className?: string;
};

/** "Bot" from SVG Repo (CC0), on a 24-unit grid. */
const BOT_PATH =
  "M21 10.975V8a2 2 0 0 0-2-2h-6V4.688c.305-.274.5-.668.5-1.11a1.5 1.5 0 0 0-3 0c0 .442.195.836.5 1.11V6H5a2 2 0 0 0-2 2v2.998l-.072.005A.999.999 0 0 0 2 12v2a1 1 0 0 0 1 1v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a1 1 0 0 0 1-1v-1.938a1.004 1.004 0 0 0-.072-.455c-.202-.488-.635-.605-.928-.632zM7 12c0-1.104.672-2 1.5-2s1.5.896 1.5 2-.672 2-1.5 2S7 13.104 7 12zm8.998 6c-1.001-.003-7.997 0-7.998 0v-2s7.001-.002 8.002 0l-.004 2zm-.498-4c-.828 0-1.5-.896-1.5-2s.672-2 1.5-2 1.5.896 1.5 2-.672 2-1.5 2z";

/**
 * The Chat Buddy mark, inlined as SVG rather than loaded as an image.
 *
 * Inline means no request, no layout shift, and a gradient that follows the
 * chosen accent. The same artwork lives in `src/assets/brand-icon.svg`,
 * which is the source `scripts/build-icons.mjs` renders the PWA icons from.
 */
function BrandMark({ size = 32, className }: BrandMarkProps) {
  /*
   * The gradient id must be unique per instance.
   *
   * SVG paint references are document-scoped, not element-scoped: with a
   * hard-coded id, every mark on the page would resolve `url(#...)` to whichever
   * definition came first in document order. When that first one happened to sit
   * inside the collapsed sidebar, the gradient failed to paint and the mark
   * rendered as a bare white bubble.
   */
  const gradientId = `brand-field-${useId()}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      className={className}
      role="img"
      aria-label="Chat Buddy"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          {/* Two accent stops, so the mark always matches the chosen palette. */}
          <stop offset="0" className="[stop-color:var(--accent-400)]" />
          <stop offset="1" className="[stop-color:var(--accent-600)]" />
        </linearGradient>
      </defs>

      <rect width="512" height="512" rx="116" fill={`url(#${gradientId})`} />

      {/*
       * Bot glyph — "Bot" from SVG Repo, CC0 — drawn on a 24-unit grid and scaled to
       * fill about 60% of the tile. Its eyes and mouth are cut-outs, so the accent
       * shows through them.
       */}
      <path transform="translate(76 76) scale(15)" fill="#ffffff" d={BOT_PATH} />
    </svg>
  );
}

export { BrandMark };
