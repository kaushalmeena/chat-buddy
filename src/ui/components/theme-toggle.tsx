import { Monitor, Moon, Sun } from "lucide";
import type { JSX } from "preact";
import {
  setThemePreference,
  type ThemePreference,
  themePreference,
} from "@/state/settings-store.ts";
import { Icon } from "./icon.tsx";

const OPTIONS: readonly {
  readonly value: ThemePreference;
  readonly label: string;
  readonly icon: Parameters<typeof Icon>[0]["icon"];
}[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/**
 * Three-way theme control.
 *
 * `system` is a first-class choice rather than just the initial value, so
 * someone who wants the app to track their OS can say so explicitly after having
 * pinned it once.
 */
export function ThemeToggle(): JSX.Element {
  const current = themePreference.value;

  return (
    // A real <fieldset> of radio inputs rather than buttons with role="radio":
    // native radios bring arrow-key navigation and a single tab stop for free,
    // which a scripted radiogroup has to reimplement to match.
    <fieldset class="flex gap-0.5 rounded-lg border border-border-subtle bg-surface p-0.5">
      <legend class="sr-only">Theme</legend>

      {OPTIONS.map(({ value, label, icon }) => {
        const isSelected = value === current;

        return (
          <label
            key={value}
            title={label}
            class={`grid flex-1 cursor-pointer place-items-center rounded-md py-1.5 transition-colors has-focus-visible:outline has-focus-visible:outline-brand-500 ${
              isSelected
                ? "bg-surface-raised text-content"
                : "text-content-faint hover:text-content-muted"
            }`}
          >
            <input
              type="radio"
              name="theme"
              value={value}
              checked={isSelected}
              onChange={() => setThemePreference(value)}
              class="sr-only"
            />
            <span class="sr-only">{label}</span>
            <Icon icon={icon} size={15} />
          </label>
        );
      })}
    </fieldset>
  );
}
