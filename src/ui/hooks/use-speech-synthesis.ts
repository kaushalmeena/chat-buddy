import { useCallback, useEffect, useRef, useState } from "react";
import { toSpeakableText, toUtteranceChunks } from "@/lib/speech-text.ts";
import { loadVoices, pickVoice, usableVoices } from "@/lib/speech-voices.ts";
import { useSettings } from "@/state/settings-store.ts";

/**
 * Slightly under the default rate. On-device voices at 1.0 read a shade faster
 * than is comfortable for text you have not seen before.
 */
const SPEECH_RATE = 0.95;

/**
 * Reads assistant replies aloud.
 *
 * Synthesis genuinely runs on-device in every current browser, so unlike
 * recognition it costs nothing in privacy terms.
 */
function useSpeechSynthesis() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  const preferredVoiceUri = useSettings((state) => state.voiceUri);

  const isSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  // Held in a ref so `speak` does not need to change identity when the voice list
  // arrives, which would otherwise re-run every effect that depends on it.
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const preferredVoiceUriRef = useRef(preferredVoiceUri);
  preferredVoiceUriRef.current = preferredVoiceUri;

  /*
   * Load the voice list once.
   *
   * `getVoices()` is empty on the first call in every browser — the list arrives
   * asynchronously via `voiceschanged`. Reading it synchronously is why no voice
   * was ever selected and the engine fell back to its own default.
   */
  useEffect(() => {
    if (!isSupported) return;

    let active = true;

    void loadVoices().then((loaded) => {
      if (!active) return;
      voicesRef.current = loaded;
      setVoices(usableVoices(loaded));
    });

    return () => {
      active = false;
    };
  }, [isSupported]);

  // Never leave an utterance running after the view goes away.
  useEffect(() => {
    if (!isSupported) return;
    return () => window.speechSynthesis.cancel();
  }, [isSupported]);

  const speak = useCallback(
    (markdown: string) => {
      if (!isSupported) return;

      // Speak prose, not markup. Passing raw markdown made the voice read
      // hashes, asterisks, table pipes and full URLs aloud.
      const text = toSpeakableText(markdown);
      if (text.length === 0) return;

      const synth = window.speechSynthesis;

      // Replace rather than queue: the newest reply is the relevant one.
      synth.cancel();

      const language = navigator.language || "en-US";
      const available = voicesRef.current;
      const chosenUri = preferredVoiceUriRef.current;

      const voice =
        available.find((candidate) => candidate.voiceURI === chosenUri) ??
        pickVoice(available, language);

      const chunks = toUtteranceChunks(text);
      if (chunks.length === 0) return;

      chunks.forEach((chunk, index) => {
        const utterance = new SpeechSynthesisUtterance(chunk);

        // Setting `voice` also fixes the language; setting `lang` alone let the
        // engine pick any voice claiming that tag, novelty ones included.
        if (voice) {
          utterance.voice = voice;
          utterance.lang = voice.lang;
        } else {
          utterance.lang = language;
        }

        utterance.rate = SPEECH_RATE;

        if (index === 0) utterance.onstart = () => setIsSpeaking(true);
        if (index === chunks.length - 1) {
          utterance.onend = () => setIsSpeaking(false);
        }
        utterance.onerror = () => setIsSpeaking(false);

        synth.speak(utterance);
      });
    },
    [isSupported],
  );

  const cancel = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [isSupported]);

  return { isSupported, isSpeaking, speak, cancel, voices };
}

export { useSpeechSynthesis };
