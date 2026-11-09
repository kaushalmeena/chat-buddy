import { ChevronDown, Play } from "lucide-react";
import { type ChangeEvent, useMemo } from "react";

import { useSpeechSynthesis } from "@/hooks/use-speak.ts";
import { useConfig } from "@/stores/config.ts";

const PREVIEW_TEXT = "Hello — this is how I sound.";

type VoiceGroup = {
  readonly lang: string;
  readonly items: readonly SpeechSynthesisVoice[];
};

/** Ranks a language tag against the browser's own: exact, same base, then the rest. */
function rankLanguage(lang: string, preferred: string, base: string): number {
  const value = lang.toLowerCase();
  if (value === preferred) return 0;
  if (value === base || value.startsWith(`${base}-`)) return 1;
  return 2;
}

/**
 * Groups voices by language so a list of 180 is navigable, with the browser's own
 * language first — it is what the person almost certainly wants.
 */
function groupVoices(voices: readonly SpeechSynthesisVoice[]): VoiceGroup[] {
  const byLanguage = new Map<string, SpeechSynthesisVoice[]>();

  for (const voice of voices) {
    const existing = byLanguage.get(voice.lang);
    if (existing) existing.push(voice);
    else byLanguage.set(voice.lang, [voice]);
  }

  const preferred = (navigator.language || "en-US").toLowerCase();
  const base = preferred.split("-")[0] ?? "";

  return [...byLanguage.entries()]
    .map(([lang, items]) => ({
      lang,
      items: items.toSorted((a, b) => a.name.localeCompare(b.name)),
    }))
    .toSorted(
      (a, b) =>
        rankLanguage(a.lang, preferred, base) - rankLanguage(b.lang, preferred, base) ||
        a.lang.localeCompare(b.lang),
    );
}

/**
 * Spoken replies: an on/off switch, then voice selection with a preview so a voice
 * can be judged by ear rather than by name. Platforms ship wildly different voice
 * sets, and on macOS the good and the useless sit in one undifferentiated list.
 */
function VoicePicker() {
  const speakReplies = useConfig((state) => state.speakReplies);
  const toggleSpeakReplies = useConfig((state) => state.toggleSpeakReplies);
  const voiceUri = useConfig((state) => state.voiceUri);
  const setVoiceUri = useConfig((state) => state.setVoiceUri);

  const { voices, speak, isSupported } = useSpeechSynthesis();
  const grouped = useMemo(() => groupVoices(voices), [voices]);

  if (!isSupported) {
    return (
      <p className="text-xs text-content-faint">This browser cannot read text aloud.</p>
    );
  }

  const handleVoiceChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setVoiceUri(event.target.value === "" ? undefined : event.target.value);
  };

  const handlePreview = () => {
    speak(PREVIEW_TEXT);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface px-3 py-2.5">
        <span className="text-sm text-content">Read replies aloud</span>
        <input
          type="checkbox"
          role="switch"
          aria-checked={speakReplies}
          checked={speakReplies}
          onChange={toggleSpeakReplies}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className="relative h-5 w-9 shrink-0 rounded-full bg-border-strong transition-colors peer-checked:bg-brand-600 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-500 after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-4"
        />
      </label>

      <div className="flex items-center gap-1.5">
        <label htmlFor="voice-select" className="sr-only">
          Voice
        </label>
        {/*
         * `appearance-none` plus an explicit chevron: the native arrow sits hard
         * against the border and every engine positions it differently.
         */}
        <div className="relative min-w-0 flex-1">
          <select
            id="voice-select"
            value={voiceUri ?? ""}
            onChange={handleVoiceChange}
            disabled={!speakReplies || voices.length === 0}
            className="h-9 w-full appearance-none truncate rounded-lg border border-border-subtle bg-surface pr-8 pl-3 text-sm text-content transition-colors hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">Automatic voice</option>
            {grouped.map((group) => (
              <VoiceOptions key={group.lang} group={group} />
            ))}
          </select>

          <ChevronDown
            size={14}
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-content-faint"
          />
        </div>

        <button
          type="button"
          onClick={handlePreview}
          disabled={!speakReplies}
          aria-label="Preview voice"
          title="Preview voice"
          className="grid size-9 shrink-0 place-items-center rounded-lg border border-border-subtle bg-surface text-content-muted transition-colors hover:border-brand-400 hover:text-content disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Play size={14} aria-hidden />
        </button>
      </div>
    </div>
  );
}

function VoiceOptions({ group }: { readonly group: VoiceGroup }) {
  return (
    <optgroup label={group.lang}>
      {group.items.map((voice) => (
        <option key={voice.voiceURI} value={voice.voiceURI}>
          {voice.name}
        </option>
      ))}
    </optgroup>
  );
}

export { VoicePicker };
