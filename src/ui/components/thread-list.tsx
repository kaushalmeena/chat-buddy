import { Plus, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";
import {
  deleteConversation,
  newConversation,
  selectConversation,
  useChat,
} from "@/state/chat-store.ts";

type ThreadListProps = {
  /** Called after a thread is picked, so the mobile drawer can close itself. */
  readonly onNavigate?: (() => void) | undefined;
};

function ThreadList({ onNavigate }: ThreadListProps) {
  const conversations = useChat((state) => state.conversations);
  const activeId = useChat((state) => state.activeId);

  // Sorting allocates, so memoise it rather than doing it inside the selector —
  // a selector returning a new array every call would re-render on every store
  // write, including each committed slice of a streaming reply.
  const threads = useMemo(
    () => [...conversations].sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations],
  );

  return (
    <div className="flex h-full flex-col gap-3">
      <motion.button
        type="button"
        whileTap={{ scale: 0.98 }}
        onClick={() => {
          newConversation();
          onNavigate?.();
        }}
        className="flex items-center gap-2 rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm font-medium text-content transition-colors hover:border-brand-400"
      >
        <Plus size={16} aria-hidden />
        New chat
      </motion.button>

      <nav
        aria-label="Conversations"
        className="scrollbar-slim -mx-1 flex-1 overflow-y-auto px-1"
      >
        <ul className="flex flex-col gap-0.5">
          <AnimatePresence initial={false}>
            {threads.map((thread) => {
              const isActive = thread.id === activeId;

              return (
                <motion.li
                  key={thread.id}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="group relative"
                >
                  <button
                    type="button"
                    onClick={() => {
                      selectConversation(thread.id);
                      onNavigate?.();
                    }}
                    aria-current={isActive ? "page" : undefined}
                    className={`w-full truncate rounded-lg py-2 pl-3 pr-9 text-left text-sm transition-colors ${
                      isActive
                        ? "bg-surface-raised font-medium text-content"
                        : "text-content-muted hover:bg-surface-raised/60 hover:text-content"
                    }`}
                  >
                    {thread.title}
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteConversation(thread.id)}
                    aria-label={`Delete "${thread.title}"`}
                    // Hidden until hover or keyboard focus, so the list stays calm
                    // without making deletion keyboard-inaccessible.
                    className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-content-faint opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      </nav>
    </div>
  );
}

export { ThreadList };
