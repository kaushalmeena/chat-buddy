import { type LucideIcon, Monitor, Moon, Sun } from "lucide-react";

import { type ThemePreference, useConfig } from "@/stores/config.ts";

type ThemeOption = {
  readonly value: ThemePreference;
  readonly label: string;
  readonly icon: LucideIcon;
};

const OPTIONS: readonly ThemeOption[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/** Indicator offsets, one per option, so the class names stay static for Tailwind. */
const INDICATOR_POSITION: Record<ThemePreference, string> = {
  light: "translate-x-0",
  dark: "translate-x-full",
  system: "translate-x-[200%]",
};

/**
 * Three-way theme control.
 *
 * A real fieldset of radio inputs rather than buttons with `role="radio"`: native
 * radios bring arrow-key navigation and a single tab stop for free. One shared
 * indicator slides between options with a CSS transform.
 */
function ThemeToggle() {
  const theme = useConfig((state) => state.theme);

  return (
    <fieldset className="relative grid grid-cols-3 rounded-xl border border-border-subtle bg-surface-raised p-1">
      <legend className="sr-only">Theme</legend>

      <span
        aria-hidden
        className={`absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-lg bg-surface shadow-card transition-transform duration-200 ease-out-soft ${INDICATOR_POSITION[theme]}`}
      />

      {OPTIONS.map((option) => (
        <ThemeOptionLabel
          key={option.value}
          option={option}
          isSelected={option.value === theme}
        />
      ))}
    </fieldset>
  );
}

function ThemeOptionLabel({
  option,
  isSelected,
}: {
  readonly option: ThemeOption;
  readonly isSelected: boolean;
}) {
  const setTheme = useConfig((state) => state.setTheme);
  const Icon = option.icon;

  const handleChange = () => {
    setTheme(option.value);
  };

  return (
    <label
      className={`relative flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors has-focus-visible:outline-2 has-focus-visible:outline-brand-500 ${
        isSelected ? "text-content" : "text-content-muted hover:text-content"
      }`}
    >
      <input
        type="radio"
        name="theme"
        value={option.value}
        checked={isSelected}
        onChange={handleChange}
        className="sr-only"
      />
      <Icon size={14} aria-hidden />
      {option.label}
    </label>
  );
}

export { ThemeToggle };
