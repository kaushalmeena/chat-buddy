import { type Message, toProviderTurns } from "@/domain/message.ts";
import { type ChatProvider, isAbortError } from "@/domain/provider.ts";

/**
 * Callbacks a caller supplies to observe one turn. Deliberately push-based: the
 * store owns the transcript, and the engine only reports what happened.
 */
export type TurnObserver = {
  /** Called for each incremental chunk, never with a cumulative snapshot. */
  onChunk(chunk: string): void;
  onComplete(): void;
  /** The person pressed stop; whatever streamed so far should be kept. */
  onStopped(): void;
  onError(message: string): void;
};

/**
 * How long a turn may run before it is abandoned. Guards against a wedged
 * inference worker leaving the UI stuck in a streaming state forever.
 */
const TURN_TIMEOUT_MS = 120_000;

/**
 * Runs a single conversation turn against a provider.
 *
 * This is the whole orchestration layer: it projects the transcript onto the
 * provider contract, pumps the resulting stream, and classifies the outcome as
 * completed, stopped or failed. It holds no state of its own.
 */
export class ChatEngine {
  #inFlight: AbortController | undefined;

  get isGenerating(): boolean {
    return this.#inFlight !== undefined;
  }

  /** Aborts the in-flight turn, if any. Safe to call when idle. */
  stop(): void {
    this.#inFlight?.abort(new DOMException("Stopped by user.", "AbortError"));
    this.#inFlight = undefined;
  }

  async run(
    provider: ChatProvider,
    messages: readonly Message[],
    observer: TurnObserver,
  ): Promise<void> {
    // One turn at a time; a new turn supersedes whatever was running.
    this.stop();

    const controller = new AbortController();
    this.#inFlight = controller;

    const timeout = setTimeout(() => {
      controller.abort(new DOMException("The model took too long.", "TimeoutError"));
    }, TURN_TIMEOUT_MS);

    try {
      const turns = toProviderTurns(messages);
      const stream = provider.generate({ turns, signal: controller.signal });

      for await (const chunk of stream) {
        if (controller.signal.aborted) break;
        observer.onChunk(chunk);
      }

      // A provider may return cleanly on abort rather than throwing, so the
      // signal — not the absence of an exception — decides the outcome.
      if (controller.signal.aborted) {
        reportAbort(controller.signal.reason, observer);
      } else {
        observer.onComplete();
      }
    } catch (error) {
      if (isAbortError(error)) {
        observer.onStopped();
      } else {
        observer.onError(describeFailure(error));
      }
    } finally {
      clearTimeout(timeout);
      if (this.#inFlight === controller) this.#inFlight = undefined;
    }
  }
}

/**
 * A user-initiated stop keeps its partial text; a timeout is a failure. Both
 * arrive as an aborted signal, so they are told apart by the abort reason.
 */
function reportAbort(reason: unknown, observer: TurnObserver): void {
  if (isAbortError(reason)) {
    observer.onStopped();
  } else {
    observer.onError(describeFailure(reason));
  }
}

/** Turns an unknown throw into something worth showing a person. */
function describeFailure(error: unknown): string {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return "The model took too long to respond.";
  }
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong while generating a reply.";
}
