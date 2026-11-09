import { ArrowUpRight } from "lucide-react";

import { sendMessage, useChat } from "@/stores/chat.ts";

import { BrandMark } from "./logo.tsx";

/**
 * Prompts offered on an empty thread. Concrete starters replace guesswork, and
 * double as a hint about what a small local model does well.
 *
 * Deliberately a plain list rather than a grid of icon cards: these are four
 * equivalent text options, and a list says so without decoration.
 */
const STARTERS: readonly string[] = [
  "What can you do?",
  "Explain WebGPU in two sentences",
  "Give me a name for a pet robot",
  "Is anything I type sent to a server?",
];

function EmptyState() {
  const provider = useChat((state) => state.activeProvider);

  return (
    <div className="scrollbar-slim flex flex-1 animate-enter flex-col items-center justify-center gap-8 overflow-y-auto px-4 py-10">
      <div className="flex flex-col items-center gap-4 text-center">
        <BrandMark size={48} className="rounded-xl shadow-card" />

        <div className="space-y-1.5">
          <h2 className="text-2xl font-semibold tracking-tight text-content">
            How can I help?
          </h2>
          <p className="mx-auto max-w-sm text-sm text-content-muted">
            {provider
              ? `Answering with ${provider.label}. Nothing you type leaves this device.`
              : "Getting the engine ready…"}
          </p>
        </div>
      </div>

      <ul
        aria-label="Suggested prompts"
        className="w-full max-w-md divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-subtle bg-surface shadow-card"
      >
        {STARTERS.map((prompt) => (
          <StarterItem key={prompt} prompt={prompt} />
        ))}
      </ul>
    </div>
  );
}

function StarterItem({ prompt }: { readonly prompt: string }) {
  const handleClick = () => {
    void sendMessage(prompt);
  };

  return (
    <li>
      <button
        type="button"
        onClick={handleClick}
        className="group flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-content-muted transition-colors hover:bg-surface-raised hover:text-content"
      >
        <span className="flex-1">{prompt}</span>
        <ArrowUpRight
          size={15}
          className="shrink-0 text-content-faint transition-colors group-hover:text-brand-500"
          aria-hidden
        />
      </button>
    </li>
  );
}

export { EmptyState };
