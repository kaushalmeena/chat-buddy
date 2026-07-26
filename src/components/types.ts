import type { ComponentType, SVGProps } from "react";

/**
 * Types shared across the UI layer.
 *
 * Domain types live in `src/domain`; this file is only for shapes that exist
 * because of how the interface is built, not because of what the app models.
 */

/**
 * The shape of a `lucide-react` icon component.
 *
 * Declared locally rather than imported as `LucideIcon` so that passing icons
 * around as props does not couple every component signature to the icon library's
 * own types.
 */
export type IconComponent = ComponentType<
  SVGProps<SVGSVGElement> & { size?: number | string }
>;
