import { Undo2, X } from "lucide-react";
import { useEffect } from "react";

import { restoreConversation } from "@/stores/chat.ts";
import { dismissUndo, useUi } from "@/stores/ui.ts";

/** Long enough to notice and reach; short enough not to linger over the composer. */
const UNDO_WINDOW_MS = 6000;

/**
 * Undo for thread deletion, instead of a confirmation prompt: recovery is safe and
 * cheap, so the person is never stopped to answer "are you sure?".
 *
 * Fixed-position, so appearing never shifts the layout.
 */
function UndoToast() {
  const deleted = useUi((state) => state.deleted);

  useEffect(() => {
    if (!deleted) return;
    const timer = setTimeout(dismissUndo, UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [deleted]);

  if (!deleted) return null;

  const handleUndo = () => {
    restoreConversation(deleted);
    dismissUndo();
  };

  return (
    <div
      role="status"
      className="fixed bottom-32 left-1/2 z-30 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 animate-pop items-center gap-1 rounded-xl border border-border-subtle bg-surface py-1.5 pr-1.5 pl-4 text-sm text-content shadow-float"
    >
      <span className="truncate">
        Deleted <span className="font-medium">“{deleted.title}”</span>
      </span>
      <button
        type="button"
        onClick={handleUndo}
        className="ml-2 flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 font-medium text-brand-600 transition-colors hover:bg-brand-500/10 dark:text-brand-400 pointer-coarse:h-11"
      >
        <Undo2 size={14} aria-hidden />
        Undo
      </button>
      <button
        type="button"
        onClick={dismissUndo}
        aria-label="Dismiss"
        className="grid size-8 shrink-0 place-items-center rounded-lg text-content-faint transition-colors hover:bg-surface-raised hover:text-content pointer-coarse:size-11"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}

export { UndoToast };
