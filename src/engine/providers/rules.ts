import type {
  ChatProvider,
  GenerateOptions,
  ProviderAvailability,
} from "@/domain/provider.ts";
import { matchRule } from "@/engine/rules/matcher.ts";
import { COMPILED_RULES } from "@/engine/rules/rules.ts";

/**
 * The always-available baseline provider, backed by the built-in rule table.
 *
 * No download, no WebGPU, no network: this is what answers when nothing else
 * can. It is also what makes the app work offline as a PWA.
 */
export class LocalRuleProvider implements ChatProvider {
  readonly id = "rules" as const;
  readonly label = "Built-in rules";
  readonly description = "Instant canned replies. Works offline on any device.";
  readonly isLocal = true;

  availability(): Promise<ProviderAvailability> {
    return Promise.resolve({ state: "ready" });
  }

  prepare(): Promise<void> {
    return Promise.resolve();
  }

  /*
   * Yields the reply a word at a time, with no artificial delay.
   *
   * Chunking keeps the output shape identical to the model providers, so the
   * caret, the stop button and the store's frame-coalescing all behave the same
   * way regardless of which provider answered.
   *
   * An earlier version paced the chunks with a 16 ms `setTimeout` to imitate
   * typing. That was a mistake twice over: it invented latency in the one
   * provider whose entire selling point is being instant, and background tabs
   * clamp timers to a second or more, which stretched a 68-character reply into
   * a 20-second crawl. Real streaming latency should come from a real model.
   */
  async *generate({ turns, signal }: GenerateOptions): AsyncIterable<string> {
    const lastUserTurn = turns.findLast((turn) => turn.role === "user");
    const match = matchRule(lastUserTurn?.content ?? "", COMPILED_RULES);
    const reply = match?.reply ?? "I didn't catch that.";

    // Split after each space so whitespace is preserved in the chunks.
    for (const chunk of reply.split(/(?<= )/u)) {
      signal.throwIfAborted();
      yield chunk;
    }
  }

  dispose(): Promise<void> {
    return Promise.resolve();
  }
}
