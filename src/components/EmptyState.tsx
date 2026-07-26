import { motion } from "motion/react";
import { sendMessage, useChat } from "@/stores/chat.ts";
import { BrandMark } from "./BrandMark.tsx";

/**
 * Prompts offered on an empty thread.
 *
 * Discoverability was the original app's weakest point: nothing on screen hinted
 * that "anime" was a keyword and "films" was not. Concrete starters replace
 * guesswork, and they double as a hint about what a small local model does well.
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
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-12 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      >
        <BrandMark size={56} className="rounded-2xl shadow-lg" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
        className="space-y-2"
      >
        <h2 className="text-2xl font-semibold tracking-tight text-content">
          What's on your mind?
        </h2>
        <p className="max-w-sm text-sm text-content-muted">
          {provider
            ? `Answering with ${provider.label.toLowerCase()}. Nothing you type leaves this device.`
            : "Starting up…"}
        </p>
      </motion.div>

      <ul className="flex w-full max-w-lg flex-wrap justify-center gap-2">
        {STARTERS.map((starter, index) => (
          <motion.li
            key={starter}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.3,
              delay: 0.12 + index * 0.04,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <button
              type="button"
              onClick={() => void sendMessage(starter)}
              className="rounded-full border border-border-subtle bg-surface px-3.5 py-1.5 text-sm text-content-muted transition-colors hover:border-brand-400 hover:text-content"
            >
              {starter}
            </button>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

export { EmptyState };
