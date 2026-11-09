import type {
  ChatProvider,
  GenerateOptions,
  ProviderAvailability,
} from "@/domain/provider.ts";
import { sleep } from "@/lib/sleep.ts";

/**
 * The always-available baseline provider, backed by the built-in conversation
 * engine — which reads the whole transcript, so it remembers what the person said
 * and follows the thread, without a model.
 *
 * No download, no WebGPU, no network: this is what answers when nothing else
 * can. It is also what makes the app work offline as a PWA.
 */
export class LocalRuleProvider implements ChatProvider {
  readonly id = "rules" as const;
  readonly label = "Built-in rules";
  readonly description = "Remembers this chat. Works offline on any device.";
  readonly isLocal = true;

  availability(): Promise<ProviderAvailability> {
    return Promise.resolve({ state: "ready" });
  }

  prepare(): Promise<void> {
    return Promise.resolve();
  }

  /*
   * Yields the reply a word at a time, paced like someone typing.
   *
   * The engine answers in microseconds, and an instant wall of text reads as
   * canned. So there is a short "thinking" pause first — the typing dots show
   * during it — scaled to the reply's length, then each word arrives after a
   * small jittered gap. Chunking word by word also keeps the output shape the
   * same as the model providers', so stop, the batcher and the reveal behave
   * identically whichever provider answered.
   *
   * Two guards from a previous attempt at this. Pauses are skipped while the tab
   * is hidden, because background tabs clamp timers to a second or more, which
   * once stretched a short reply into a 20-second crawl. And every wait is
   * abortable, so stop is immediate rather than waiting out the current pause.
   */
  async *generate({ turns, signal }: GenerateOptions): AsyncIterable<string> {
    // Loaded on first use: the engine and its corpus are not needed to open the
    // app, only to answer — and the thinking pause below covers the fetch.
    const { reply } = await import("@/engine/rules/reply.ts");
    const text = reply(turns);
    const words = text.split(/(?<= )/u);

    await pause(thinkingTime(text), signal);

    for (const [index, word] of words.entries()) {
      signal.throwIfAborted();
      const previous = words[index - 1];
      // Sequential on purpose: each pause is the gap before this word.
      // oxlint-disable-next-line no-await-in-loop
      if (previous !== undefined) await pause(wordGap(previous), signal);
      yield word;
    }
  }

  dispose(): Promise<void> {
    return Promise.resolve();
  }
}

/** Before the first word: longer replies take a moment longer to "think" up. */
function thinkingTime(text: string): number {
  return jitter(Math.min(350 + text.length * 6, 1200));
}

/** Between words: a little longer after the end of a sentence or clause. */
function wordGap(previousWord: string): number {
  const base = /[.!?]\s*$/.test(previousWord)
    ? 140
    : /[,;:—]\s*$/.test(previousWord)
      ? 80
      : 32;
  return jitter(base);
}

/** ±25%, so the rhythm never sounds mechanical. */
function jitter(ms: number): number {
  return Math.round(ms * (0.75 + Math.random() * 0.5));
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  if (typeof document !== "undefined" && document.hidden) return Promise.resolve();
  return sleep(ms, signal);
}
