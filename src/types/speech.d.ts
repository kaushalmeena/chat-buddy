/**
 * Ambient declarations for the Web Speech API's recognition half.
 *
 * `speechSynthesis` is in TypeScript's DOM lib; `SpeechRecognition` is not,
 * because it remains a prefixed, non-standard API in most browsers. Narrowed to
 * the surface `use-speech-recognition.ts` uses.
 */

type SpeechRecognitionAlternative = {
  readonly transcript: string;
  readonly confidence: number;
};

type SpeechRecognitionResult = {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  readonly [index: number]: SpeechRecognitionAlternative;
};

type SpeechRecognitionResultList = {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  readonly [index: number]: SpeechRecognitionResult;
};

type SpeechRecognitionEvent = Event & {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
};

type SpeechRecognitionErrorEvent = Event & {
  readonly error:
    | "no-speech"
    | "aborted"
    | "audio-capture"
    | "network"
    | "not-allowed"
    | "service-not-allowed"
    | "bad-grammar"
    | "language-not-supported";
  readonly message: string;
};

type SpeechRecognitionInstance = EventTarget & {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

interface Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}
