/**
 * Voice discovery and selection for speech synthesis.
 *
 * Two things make this less trivial than it looks.
 *
 * First, `getVoices()` returns an empty array on the first call in every browser
 * — the list is populated asynchronously and announced by `voiceschanged`. Code
 * that reads it synchronously at startup gets nothing, silently falls back to the
 * engine default, and never selects a voice at all.
 *
 * Second, the default is often a bad choice. macOS ships dozens of novelty voices
 * — "Bad News", "Bubbles", "Trinoids", "Zarvox" — alongside the real ones, in the
 * same list, with no flag distinguishing them. Landing on one of those is how a
 * reply ends up genuinely unintelligible.
 */

/**
 * Novelty and legacy-robotic voices to exclude from automatic selection.
 *
 * All macOS; other platforms ship nothing comparable. These are matched by exact
 * name so a real voice is never excluded by an accidental substring, and the list
 * is only ever a filter — if it somehow removed everything, selection falls back
 * to the unfiltered list rather than going silent.
 */
const EXCLUDED_VOICE_NAMES: ReadonlySet<string> = new Set([
  // Musical and joke voices.
  "Bad News",
  "Bahh",
  "Bells",
  "Boing",
  "Bubbles",
  "Cellos",
  "Good News",
  "Jester",
  "Organ",
  "Superstar",
  "Trinoids",
  "Whisper",
  "Wobble",
  "Zarvox",
  // Legacy formant-synthesis voices: intelligible at best, robotic always.
  "Agnes",
  "Albert",
  "Bruce",
  "Deranged",
  "Fred",
  "Hysterical",
  "Junior",
  "Kathy",
  "Princess",
  "Ralph",
  "Vicki",
  "Victoria",
]);

/**
 * Voices known to be high quality, preferred when present.
 *
 * Ordered best-first within a platform. Never required — an unknown voice that
 * matches the requested language still beats a known one that does not.
 */
const PREFERRED_VOICE_NAMES: readonly string[] = [
  // Apple's modern neural voices.
  "Ava",
  "Zoe",
  "Evan",
  "Noelle",
  "Nathan",
  "Samantha",
  "Allison",
  "Susan",
  "Tom",
  "Alex",
  // Google, on Chrome and Android.
  "Google US English",
  "Google UK English Female",
  "Google UK English Male",
  // Microsoft, on Edge and Windows.
  "Microsoft Aria Online (Natural)",
  "Microsoft Jenny Online (Natural)",
  "Microsoft Zira",
  "Microsoft David",
];

/**
 * Resolves the voice list, waiting for `voiceschanged` if it is not ready.
 *
 * Resolves with whatever is available after `timeoutMs` rather than hanging, so a
 * browser that never fires the event cannot block speech forever.
 */
export function loadVoices(timeoutMs = 2000): Promise<SpeechSynthesisVoice[]> {
  const synth = globalThis.speechSynthesis;
  if (!synth) return Promise.resolve([]);

  const immediate = synth.getVoices();
  if (immediate.length > 0) return Promise.resolve(immediate);

  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      synth.removeEventListener("voiceschanged", finish);
      resolve(synth.getVoices());
    };

    const timer = setTimeout(finish, timeoutMs);
    synth.addEventListener("voiceschanged", finish);
  });
}

/** Voices worth offering or selecting, novelty entries removed. */
export function usableVoices(
  voices: readonly SpeechSynthesisVoice[],
): SpeechSynthesisVoice[] {
  const filtered = voices.filter((voice) => !EXCLUDED_VOICE_NAMES.has(voice.name));
  // Never let the filter empty the list on a platform we did not anticipate.
  return filtered.length > 0 ? filtered : [...voices];
}

function baseLanguage(tag: string): string {
  return tag.toLowerCase().split("-")[0] ?? "";
}

/**
 * Scores a voice for a requested language. Higher is better; used only to rank.
 */
function score(voice: SpeechSynthesisVoice, language: string): number {
  const wanted = language.toLowerCase();
  const voiceLang = voice.lang.toLowerCase();

  let total = 0;

  // Language match dominates everything else: a great voice speaking the wrong
  // language mispronounces every word.
  if (voiceLang === wanted) total += 1000;
  else if (baseLanguage(voiceLang) === baseLanguage(wanted)) total += 500;

  const preferredIndex = PREFERRED_VOICE_NAMES.findIndex((name) =>
    voice.name.startsWith(name),
  );
  if (preferredIndex !== -1) {
    total += 100 - preferredIndex;
  }

  // "Natural"/"Neural"/"Premium"/"Enhanced" mark the good variants on Windows
  // and macOS respectively.
  if (/natural|neural|premium|enhanced/i.test(voice.name)) total += 60;

  // Local voices start instantly and work offline, which matters for an app whose
  // whole premise is running on-device.
  if (voice.localService) total += 25;

  if (voice.default) total += 10;

  return total;
}

/**
 * Picks the best available voice for a language.
 *
 * Returns undefined only when there are no voices at all, in which case the
 * caller should leave `utterance.voice` unset and let the engine decide.
 */
export function pickVoice(
  voices: readonly SpeechSynthesisVoice[],
  language: string,
): SpeechSynthesisVoice | undefined {
  const candidates = usableVoices(voices);
  if (candidates.length === 0) return undefined;

  return candidates.reduce((best, voice) =>
    score(voice, language) > score(best, language) ? voice : best,
  );
}
