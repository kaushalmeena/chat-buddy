import { useCallback, useEffect, useRef, useState } from "react";

function getConstructor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

/** True when this browser can transcribe speech at all. */
const isSpeechRecognitionSupported = (): boolean => getConstructor() !== undefined;

export type SpeechRecognitionState = {
  readonly isSupported: boolean;
  readonly isListening: boolean;
  /** The best-guess transcript so far, including interim words. */
  readonly transcript: string;
  readonly error: string | undefined;
  start(): void;
  stop(): void;
};

type Options = {
  /** Called once with the final transcript when a phrase completes. */
  readonly onFinalResult?: (transcript: string) => void;
};

/**
 * Dictation for the composer, via the Web Speech API.
 *
 * Note that in Chrome this is not an on-device model — audio is sent to Google's
 * speech service. That is a meaningful difference from the rest of the app, so
 * the UI labels the control rather than presenting it as local.
 */
function useSpeechRecognition(options: Options = {}): SpeechRecognitionState {
  const { onFinalResult } = options;

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);

  const recognitionRef = useRef<SpeechRecognitionInstance | undefined>(undefined);

  // Held in a ref so re-creating the callback does not tear down recognition.
  const onFinalResultRef = useRef(onFinalResult);
  onFinalResultRef.current = onFinalResult;

  const isSupported = getConstructor() !== undefined;

  useEffect(() => {
    const Constructor = getConstructor();
    if (!Constructor) return;

    const recognition = new Constructor();
    recognition.lang = navigator.language || "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let interim = "";
      let final = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (!result) continue;
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) {
          final += text;
        } else {
          interim += text;
        }
      }

      setTranscript(final || interim);

      if (final) {
        onFinalResultRef.current?.(final.trim());
      }
    };

    recognition.onerror = (event) => {
      setError(describeRecognitionError(event.error));
      setIsListening(false);
    };

    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;

    return () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
      recognitionRef.current = undefined;
    };
  }, []);

  const start = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;

    setError(undefined);
    setTranscript("");

    try {
      recognition.start();
      setIsListening(true);
    } catch {
      // `start()` throws if recognition is already running; treat as a no-op.
    }
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  return { isSupported, isListening, transcript, error, start, stop };
}

function describeRecognitionError(error: SpeechRecognitionErrorEvent["error"]): string {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was denied.";
    case "audio-capture":
      return "No microphone was found.";
    case "network":
      return "Speech recognition needs a network connection.";
    case "no-speech":
      return "I didn't hear anything.";
    default:
      return "Speech recognition failed.";
  }
}

export { isSpeechRecognitionSupported, useSpeechRecognition };
