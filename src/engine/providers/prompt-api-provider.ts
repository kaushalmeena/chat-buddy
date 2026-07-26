import type { ProviderTurn } from "@/domain/message.ts";
import {
  type ChatProvider,
  type DownloadProgress,
  type GenerateOptions,
  type ProviderAvailability,
  ProviderError,
} from "@/domain/provider.ts";
import { HISTORY_TURN_LIMIT, SYSTEM_PROMPT } from "./system-prompt.ts";

/**
 * Chrome's built-in Gemini Nano, reached through the Prompt API.
 *
 * The best option when it exists: the weights ship with the browser, so this
 * costs the bundle nothing and starts instantly. It is also the narrowest —
 * Chrome 148+ on desktop only, and the device needs the disk and RAM headroom
 * Chrome requires before it reports the model as available.
 *
 * @see https://developer.chrome.com/docs/ai/built-in
 */
export class PromptApiProvider implements ChatProvider {
  readonly id = "prompt-api" as const;
  readonly label = "Chrome built-in AI";
  readonly description = "Gemini Nano, already on your device. No download.";
  readonly isLocal = true;

  /** Set once the model has been downloaded and a session has succeeded. */
  #prepared = false;

  async availability(): Promise<ProviderAvailability> {
    if (typeof LanguageModel === "undefined") {
      return { state: "unavailable", reason: "unsupported-browser" };
    }

    try {
      const availability = await LanguageModel.availability();

      switch (availability) {
        case "available":
          return { state: "ready" };
        case "downloadable":
        case "downloading":
          // Chrome manages the weights and does not expose a size, so report
          // zero rather than inventing a number the UI would display.
          return { state: "needs-download", bytes: 0 };
        default:
          return { state: "unavailable", reason: "insufficient-resources" };
      }
    } catch {
      return { state: "unavailable", reason: "insufficient-resources" };
    }
  }

  /**
   * Triggers the model download, if any, by opening and immediately discarding a
   * session. Sessions themselves are created per turn in `generate`.
   */
  async prepare(onProgress?: (progress: DownloadProgress) => void): Promise<void> {
    if (this.#prepared) return;

    const session = await this.#createSession([], onProgress);
    session.destroy();
    this.#prepared = true;
  }

  async *generate({ turns, signal }: GenerateOptions): AsyncIterable<string> {
    const history = recentTurns(turns);
    const prompt = history.at(-1);

    if (prompt?.role !== "user") return;

    /*
     * A fresh session per turn, seeded with the transcript.
     *
     * Prompt API sessions accumulate context internally, but reusing one would
     * let the model's history drift from what is on screen the moment a person
     * stops a generation, retries a message, or switches threads. Passing the
     * transcript explicitly keeps the two in lockstep, and costs little here
     * because the weights are already resident in the browser.
     */
    const session = await this.#createSession(history.slice(0, -1));

    try {
      const stream = session.promptStreaming(prompt.content, { signal });
      for await (const chunk of stream) {
        signal.throwIfAborted();
        yield chunk;
      }
    } catch (cause) {
      if (signal.aborted) throw cause;
      throw new ProviderError(this.id, "The built-in model failed to reply.", {
        cause,
      });
    } finally {
      session.destroy();
    }
  }

  async #createSession(
    history: readonly ProviderTurn[],
    onProgress?: (progress: DownloadProgress) => void,
  ): Promise<LanguageModelSession> {
    if (typeof LanguageModel === "undefined") {
      throw new ProviderError(this.id, "This browser has no built-in AI model.");
    }

    try {
      return await LanguageModel.create({
        initialPrompts: [
          { role: "system", content: SYSTEM_PROMPT },
          ...history.map((turn) => ({ role: turn.role, content: turn.content })),
        ],
        monitor(monitor) {
          monitor.addEventListener("downloadprogress", (event) => {
            onProgress?.({ ratio: event.loaded, label: "Downloading Gemini Nano" });
          });
        },
      });
    } catch (cause) {
      throw new ProviderError(this.id, "Chrome could not start its built-in model.", {
        cause,
      });
    }
  }

  dispose(): Promise<void> {
    this.#prepared = false;
    return Promise.resolve();
  }
}

/**
 * Trims the transcript to the most recent turns. Gemini Nano's context window is
 * small, and an over-long `initialPrompts` array fails session creation outright.
 */
function recentTurns(turns: readonly ProviderTurn[]): readonly ProviderTurn[] {
  return turns.length <= HISTORY_TURN_LIMIT ? turns : turns.slice(-HISTORY_TURN_LIMIT);
}
