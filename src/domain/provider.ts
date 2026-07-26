import type { ProviderTurn, ReplySource } from "./message.ts";

/**
 * Why a provider cannot be used right now. Kept as a closed union because the
 * UI renders a different, specific explanation for each case — "your browser
 * has no WebGPU" and "this model needs to download first" call for very
 * different affordances.
 */
export type UnavailableReason =
  | "unsupported-browser"
  | "no-webgpu"
  | "insufficient-resources"
  | "module-missing";

export type ProviderAvailability =
  /** Usable immediately, no download required. */
  | { readonly state: "ready" }
  /** Usable, but weights must be fetched first. `bytes` is an estimate. */
  | { readonly state: "needs-download"; readonly bytes: number }
  /** Not usable on this device or in this browser. */
  | { readonly state: "unavailable"; readonly reason: UnavailableReason };

export type DownloadProgress = {
  /** 0 to 1. Providers that cannot report a ratio omit this. */
  readonly ratio?: number;
  readonly label: string;
};

export type GenerateOptions = {
  readonly turns: readonly ProviderTurn[];
  readonly signal: AbortSignal;
};

/**
 * A source of assistant replies.
 *
 * Every implementation streams, even the rule engine — a single output shape
 * means the UI has one code path for "tokens are arriving" and providers stay
 * swappable. Implementations must treat `signal` as authoritative and stop
 * yielding promptly when it aborts.
 */
export type ChatProvider = {
  readonly id: ReplySource;
  readonly label: string;
  /** One line, shown in the provider picker. */
  readonly description: string;
  /** True when replies never leave the device. All current providers: true. */
  readonly isLocal: boolean;

  availability(): Promise<ProviderAvailability>;

  /**
   * Loads whatever the provider needs to answer. Safe to call repeatedly; a
   * provider that is already prepared resolves immediately.
   */
  prepare(onProgress?: (progress: DownloadProgress) => void): Promise<void>;

  /** Yields incremental text chunks, not cumulative snapshots. */
  generate(options: GenerateOptions): AsyncIterable<string>;

  /** Releases models, workers and sessions. */
  dispose(): Promise<void>;
};

/** Raised by providers when generation fails for a reportable reason. */
export class ProviderError extends Error {
  readonly providerId: ReplySource;

  constructor(providerId: ReplySource, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ProviderError";
    this.providerId = providerId;
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
