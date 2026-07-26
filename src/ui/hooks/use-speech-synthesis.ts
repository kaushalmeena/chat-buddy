import { useCallback, useEffect, useState } from "react";

/**
 * Reads assistant replies aloud.
 *
 * Unlike recognition, synthesis genuinely runs on-device in every current
 * browser, so it costs nothing in privacy terms.
 */
function useSpeechSynthesis() {
  const [isSpeaking, setIsSpeaking] = useState(false);

  const isSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  // Never leave an utterance running after the view goes away.
  useEffect(() => {
    if (!isSupported) return;
    return () => window.speechSynthesis.cancel();
  }, [isSupported]);

  const speak = useCallback(
    (text: string) => {
      if (!isSupported) return;

      const trimmed = text.trim();
      if (trimmed.length === 0) return;

      // Replace rather than queue: the newest reply is the relevant one.
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(trimmed);
      utterance.lang = navigator.language || "en-US";
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      window.speechSynthesis.speak(utterance);
    },
    [isSupported],
  );

  const cancel = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [isSupported]);

  return { isSupported, isSpeaking, speak, cancel };
}

export { useSpeechSynthesis };
