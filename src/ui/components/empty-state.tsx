import type { JSX } from "preact";
import { activeProvider, sendMessage } from "@/state/chat-store.ts";
import { BrandMark } from "./brand-mark.tsx";

/**
 * Prompts offered on an empty thread.
 *
 * Discoverability was the original app's weakest point: nothing on screen hinted
 * that "anime" was a keyword and "films" was not. Concrete starters replace
 * guesswork, and they double as a hint about what a small local model handles
 * well.
 */
const STARTERS: readonly string[] = [
  "What can you do?",
  "Explain WebGPU in two sentences",
  "Give me a name for a pet robot",
  "Is anything I type sent to a server?",
];

export function EmptyState(): JSX.Element {
  const provider = activeProvider.value;

  return (
    <div class="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-12 text-center">
      <BrandMark size={56} class="rounded-2xl shadow-lg" />

      <div class="space-y-2">
        <h2 class="text-2xl font-semibold tracking-tight text-content">
          What's on your mind?
        </h2>
        <p class="max-w-sm text-sm text-content-muted">
          {provider
            ? `Answering with ${provider.label.toLowerCase()}. Nothing you type leaves this device.`
            : "Starting up…"}
        </p>
      </div>

      <ul class="flex w-full max-w-lg flex-wrap justify-center gap-2">
        {STARTERS.map((starter) => (
          <li key={starter}>
            <button
              type="button"
              onClick={() => void sendMessage(starter)}
              class="rounded-full border border-border-subtle bg-surface px-3.5 py-1.5 text-sm text-content-muted transition-colors hover:border-brand-400 hover:text-content"
            >
              {starter}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
