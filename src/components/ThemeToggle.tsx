import { type LucideIcon, Monitor, Moon, Sun } from "lucide-react";
import { motion } from "motion/react";
import { type ThemePreference, useConfig } from "@/stores/config.ts";

const OPTIONS: readonly {
  readonly value: ThemePreference;
  readonly label: string;
  readonly icon: LucideIcon;
}[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/**
 * Three-way theme control.
 *
 * `system` is a first-class choice rather than just the initial value, so someone
 * who wants the app to track their OS can say so after having pinned it once.
 */
function ThemeToggle() {
  const theme = useConfig((state) => state.theme);
  const setTheme = useConfig((state) => state.setTheme);

  return (
    // A real fieldset of radio inputs rather than buttons with role="radio":
    // native radios bring arrow-key navigation and a single tab stop for free.
    <fieldset className="relative flex gap-0.5 rounded-lg border border-border-subtle bg-surface p-0.5">
      <legend className="sr-only">Theme</legend>

      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const isSelected = value === theme;

        return (
          <label
            key={value}
            title={label}
            className="relative grid flex-1 cursor-pointer place-items-center rounded-md py-1.5 has-focus-visible:outline has-focus-visible:outline-brand-500"
          >
            <input
              type="radio"
              name="theme"
              value={value}
              checked={isSelected}
              onChange={() => setTheme(value)}
              className="sr-only"
            />

            {/*
             * One shared element that slides between options, rather than three
             * backgrounds cross-fading. `layoutId` lets motion animate the real
             * position change, so the indicator tracks the selection.
             */}
            {isSelected && (
              <motion.span
                layoutId="theme-indicator"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-md bg-surface-raised"
              />
            )}

            <span className="sr-only">{label}</span>
            {/* `relative` keeps the glyph above the sliding indicator. */}
            <Icon
              size={15}
              aria-hidden
              className={`relative ${isSelected ? "text-content" : "text-content-faint"}`}
            />
          </label>
        );
      })}
    </fieldset>
  );
}

export { ThemeToggle };
