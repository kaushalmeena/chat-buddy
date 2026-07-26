import { h, type JSX } from "preact";

/**
 * A Lucide icon node: an array of `[tag, attributes]` pairs describing the SVG
 * children. Mirrors the `lucide` package's exported type without importing it,
 * so this module has no runtime dependency on the icon set.
 */
export type IconNode = readonly [
  tag: string,
  attrs: Record<string, string | number | undefined>,
][];

type IconProps = {
  readonly icon: IconNode;
  /** Rendered size in pixels. Matches Lucide's 24px grid by default. */
  readonly size?: number;
  readonly strokeWidth?: number;
  readonly class?: string;
  /**
   * Accessible name. Omit for icons that sit beside a text label or inside a
   * button that already has one — the icon is then marked decorative.
   */
  readonly label?: string;
};

/**
 * Renders a Lucide icon from its node data.
 *
 * Importing icons individually (`import { Send } from "lucide"`) means the
 * bundle carries only the handful actually used — a few hundred bytes, against
 * the ~100 KB icon font the Bootstrap Icons stylesheet pulled in.
 */
export function Icon({
  icon,
  size = 20,
  strokeWidth = 2,
  class: className,
  label,
}: IconProps): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
      class={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
    >
      {icon.map(([tag, attrs], index) => h(tag, { ...attrs, key: index }))}
    </svg>
  );
}
