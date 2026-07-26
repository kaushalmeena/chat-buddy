/**
 * Ambient declarations for Chrome's built-in AI Prompt API.
 *
 * Not part of TypeScript's DOM lib, since the API is Chrome-only (148+, desktop)
 * and not yet on a cross-browser standards track. Narrowed to the surface this
 * app actually uses.
 *
 * @see https://developer.chrome.com/docs/ai/built-in
 */

type LanguageModelAvailability =
  | "unavailable"
  | "downloadable"
  | "downloading"
  | "available";

type LanguageModelRole = "system" | "user" | "assistant";

type LanguageModelPrompt = {
  role: LanguageModelRole;
  content: string;
};

type LanguageModelDownloadProgressEvent = Event & {
  /** Fraction downloaded, 0 to 1. */
  readonly loaded: number;
};

type LanguageModelMonitor = {
  addEventListener(
    type: "downloadprogress",
    listener: (event: LanguageModelDownloadProgressEvent) => void,
  ): void;
};

type LanguageModelCreateOptions = {
  signal?: AbortSignal;
  initialPrompts?: LanguageModelPrompt[];
  temperature?: number;
  topK?: number;
  monitor?: (monitor: LanguageModelMonitor) => void;
};

type LanguageModelPromptOptions = {
  signal?: AbortSignal;
  responseConstraint?: object;
};

type LanguageModelSession = {
  prompt(input: string, options?: LanguageModelPromptOptions): Promise<string>;
  promptStreaming(
    input: string,
    options?: LanguageModelPromptOptions,
  ): ReadableStream<string>;
  clone(options?: { signal?: AbortSignal }): Promise<LanguageModelSession>;
  destroy(): void;
  readonly contextUsage: number;
  readonly contextWindow: number;
};

/*
 * Only the members this app calls are declared.
 *
 * `params()` is documented but absent from some shipping Chrome builds — it threw
 * `is not a function` on the Chrome this was developed against. Declaring an API
 * that may not exist invites a call that type-checks and then crashes, so it is
 * left out until something here actually needs it.
 */
declare const LanguageModel:
  | {
      availability(): Promise<LanguageModelAvailability>;
      create(options?: LanguageModelCreateOptions): Promise<LanguageModelSession>;
    }
  | undefined;
