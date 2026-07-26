import type {
  ChatProvider,
  GenerateOptions,
  ProviderAvailability,
} from "@/domain/provider.ts";
import { delay } from "@/lib/async.ts";
import { matchRule } from "../rules/matcher.ts";
import { COMPILED_RULES } from "../rules/rules.ts";

/**
 * Chunk size and cadence for replaying a canned reply as a stream. Purely
 * cosmetic — it keeps the rule engine visually consistent with the model
 * providers instead of snapping a full sentence into place.
 */
const CHUNK_SIZE = 3;
const CHUNK_DELAY_MS = 16;

/**
 * The always-available baseline provider, backed by the built-in rule table.
 *
 * No download, no WebGPU, no network: this is what answers when nothing else
 * can. It is also what makes the app work offline as a PWA.
 */
export class RuleProvider implements ChatProvider {
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

  async *generate({ turns, signal }: GenerateOptions): AsyncIterable<string> {
    const lastUserTurn = turns.findLast((turn) => turn.role === "user");
    const match = matchRule(lastUserTurn?.content ?? "", COMPILED_RULES);
    const reply = match?.reply ?? "I didn't catch that.";

    // Replay in small chunks so the caret and stop button behave exactly as
    // they do for a real model.
    for (let index = 0; index < reply.length; index += CHUNK_SIZE) {
      signal.throwIfAborted();
      yield reply.slice(index, index + CHUNK_SIZE);
      await delay(CHUNK_DELAY_MS, signal);
    }
  }

  dispose(): Promise<void> {
    return Promise.resolve();
  }
}
