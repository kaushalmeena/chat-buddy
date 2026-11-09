import { Check } from "lucide-react";

import { type Accent, ACCENTS, useConfig } from "@/stores/config.ts";

const LABELS: Record<Accent, string> = {
  teal: "Teal",
  blue: "Blue",
  green: "Green",
  orange: "Orange",
  pink: "Pink",
};

/**
 * Accent swatches: a fieldset of native radios, like the theme control. Each swatch
 * sets `data-accent` on itself, so it renders its own palette whatever the page's is.
 */
function AccentPicker() {
  const accent = useConfig((state) => state.accent);

  return (
    <fieldset className="flex flex-wrap gap-2 pt-1">
      <legend className="mb-2 text-xs text-content-muted">Accent colour</legend>
      {ACCENTS.map((value) => (
        <Swatch key={value} value={value} isSelected={value === accent} />
      ))}
    </fieldset>
  );
}

function Swatch({
  value,
  isSelected,
}: {
  readonly value: Accent;
  readonly isSelected: boolean;
}) {
  const setAccent = useConfig((state) => state.setAccent);

  const handleChange = () => {
    setAccent(value);
  };

  return (
    <label
      data-accent={value}
      title={LABELS[value]}
      className={`grid size-9 cursor-pointer place-items-center rounded-full bg-brand-600 text-white ring-offset-2 ring-offset-canvas transition-shadow has-focus-visible:outline-2 has-focus-visible:outline-brand-500 pointer-coarse:size-11 ${
        isSelected ? "ring-2 ring-brand-500" : "hover:ring-2 hover:ring-border-strong"
      }`}
    >
      <input
        type="radio"
        name="accent"
        value={value}
        checked={isSelected}
        onChange={handleChange}
        className="sr-only"
      />
      <span className="sr-only">{LABELS[value]}</span>
      {isSelected && <Check size={15} strokeWidth={2.5} aria-hidden />}
    </label>
  );
}

export { AccentPicker };
