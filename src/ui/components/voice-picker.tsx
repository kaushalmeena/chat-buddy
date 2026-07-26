import { ChevronDown, Volume2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { useSettings } from "@/state/settings-store.ts";
import { useSpeechSynthesis } from "../hooks/use-speech-synthesis.ts";

const PREVIEW_TEXT = "Hello — this is how I sound.";

/**
 * Voice selection for spoken replies.
 *
 * Auto-selection gets it right often enough, but "often enough" is not good enough
 * when the fallback is an unintelligible novelty voice: platforms ship wildly
 * different voice sets, and on macOS the good and the useless sit in one
 * undifferentiated list. This makes the choice self-service, with a preview so it
 * can be judged by ear rather than by name.
 *
 * Only rendered while spoken replies are on — it is meaningless otherwise.
 */
function VoicePicker() {
  const speakReplies = useSettings((state) => state.speakReplies);
  const voiceUri = useSettings((state) => state.voiceUri);
  const setVoiceUri = useSettings((state) => state.setVoiceUri);

  const { voices, speak, isSupported } = useSpeechSynthesis();

  /** True once the reveal animation has finished, so clipping can be dropped. */
  const [isSettled, setIsSettled] = useState(false);

  /*
   * Group by language so a list of 180 voices is navigable, and put the
   * browser's own language first — it is what the person almost certainly wants.
   */
  const grouped = useMemo(() => {
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
        items: [...items].sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => {
        const rank = (lang: string) => {
          const value = lang.toLowerCase();
          if (value === preferred) return 0;
          if (value.startsWith(`${base}-`) || value === base) return 1;
          return 2;
        };
        return rank(a.lang) - rank(b.lang) || a.lang.localeCompare(b.lang);
      });
  }, [voices]);

  return (
    <AnimatePresence initial={false} onExitComplete={() => setIsSettled(false)}>
      {speakReplies && isSupported && voices.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          onAnimationComplete={() => setIsSettled(true)}
          /*
           * Clipping is only needed while the height animates. Left in place, it
           * also clips the focus ring — which sits 2px outside the element by way
           * of `outline-offset` — so the select's ring came out cut off along the
           * container edges. Released once the reveal has settled.
           */
          className={isSettled ? "" : "overflow-hidden"}
        >
          <div className="flex flex-col gap-1.5 pt-1">
            <label
              htmlFor="voice-select"
              className="px-1 text-xs font-semibold uppercase tracking-wide text-content-faint"
            >
              Voice
            </label>

            <div className="flex items-center gap-1.5">
              {/*
               * `appearance-none` plus an explicit chevron.
               *
               * The native arrow sits hard against the right border and every
               * engine positions it slightly differently, so it cannot be spaced
               * reliably with padding alone. Drawing it here gives exact control
               * and uses the same icon set as the rest of the UI. The right
               * padding reserves room for it, and the icon ignores pointer events
               * so clicking it still opens the menu.
               */}
              <div className="relative min-w-0 flex-1">
                <select
                  id="voice-select"
                  value={voiceUri ?? ""}
                  onChange={(event) =>
                    setVoiceUri(
                      event.target.value === "" ? undefined : event.target.value,
                    )
                  }
                  className="w-full appearance-none truncate rounded-lg border border-border-subtle bg-surface py-1.5 pl-2 pr-8 text-xs text-content transition-colors hover:border-border-strong"
                >
                  <option value="">Automatic</option>
                  {grouped.map(({ lang, items }) => (
                    <optgroup key={lang} label={lang}>
                      {items.map((voice) => (
                        <option key={voice.voiceURI} value={voice.voiceURI}>
                          {voice.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>

                <ChevronDown
                  size={14}
                  aria-hidden
                  className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-content-faint"
                />
              </div>

              <button
                type="button"
                onClick={() => speak(PREVIEW_TEXT)}
                aria-label="Preview voice"
                title="Preview voice"
                className="grid size-8 shrink-0 place-items-center rounded-lg border border-border-subtle bg-surface text-content-muted transition-colors hover:border-brand-400 hover:text-content"
              >
                <Volume2 size={14} aria-hidden />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export { VoicePicker };
