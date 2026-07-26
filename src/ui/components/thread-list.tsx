import { Plus, Trash2 } from "lucide";
import type { JSX } from "preact";
import {
  activeConversationId,
  deleteConversation,
  newConversation,
  orderedConversations,
  selectConversation,
} from "@/state/chat-store.ts";
import { Icon } from "./icon.tsx";

type ThreadListProps = {
  /** Called after a thread is picked, so the mobile drawer can close itself. */
  readonly onNavigate?: (() => void) | undefined;
};

export function ThreadList({ onNavigate }: ThreadListProps): JSX.Element {
  const threads = orderedConversations.value;
  const activeId = activeConversationId.value;

  return (
    <div class="flex h-full flex-col gap-3">
      <button
        type="button"
        onClick={() => {
          newConversation();
          onNavigate?.();
        }}
        class="flex items-center gap-2 rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm font-medium text-content transition-colors hover:border-brand-400"
      >
        <Icon icon={Plus} size={16} />
        New chat
      </button>

      <nav
        aria-label="Conversations"
        class="scrollbar-slim -mx-1 flex-1 overflow-y-auto px-1"
      >
        <ul class="flex flex-col gap-0.5">
          {threads.map((thread) => {
            const isActive = thread.id === activeId;

            return (
              <li key={thread.id} class="group relative">
                <button
                  type="button"
                  onClick={() => {
                    selectConversation(thread.id);
                    onNavigate?.();
                  }}
                  aria-current={isActive ? "page" : undefined}
                  class={`w-full truncate rounded-lg py-2 pl-3 pr-9 text-left text-sm transition-colors ${
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
                  class="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-content-faint opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Icon icon={Trash2} size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
