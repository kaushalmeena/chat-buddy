import { ExternalLink, Settings, SquarePen, X } from "lucide-react";

import { BrandMark } from "@/components/logo.tsx";
import { ThreadList } from "@/components/threads.tsx";
import { newConversation } from "@/stores/chat.ts";
import { closeDrawer, focusComposer, openSettings } from "@/stores/ui.ts";

const REPO_URL = "https://github.com/kaushalmeena/chat-buddy";

type SidebarProps = {
  /** Rendered inside the mobile drawer, which needs its own close button. */
  readonly isDrawer?: boolean;
};

/**
 * Threads and nothing else, plus a way into settings. Engine, voice and theme used
 * to live here too, which buried the thread list under controls people touch once.
 */
function handleNewChat() {
  newConversation();
  closeDrawer();
  focusComposer();
}

function Sidebar({ isDrawer = false }: SidebarProps) {
  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex h-8 items-center justify-between gap-2 px-1">
        <span className="flex items-center gap-2">
          <BrandMark size={24} className="rounded-md" />
          <span className="font-semibold tracking-tight text-content">Chat Buddy</span>
        </span>

        {isDrawer && (
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="Close menu"
            className="grid size-8 place-items-center rounded-lg text-content-muted hover:bg-surface-raised hover:text-content"
          >
            <X size={17} aria-hidden />
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={handleNewChat}
        title="New chat (Ctrl+Shift+O)"
        className="flex h-9 items-center gap-2 rounded-lg border border-border-subtle bg-surface px-3 text-sm font-medium text-content shadow-card transition-[border-color,scale] hover:border-border-strong active:scale-[0.98] pointer-coarse:h-11"
      >
        <SquarePen size={15} aria-hidden />
        New chat
      </button>

      <div className="min-h-0 flex-1">
        <ThreadList />
      </div>

      <div className="flex flex-col gap-0.5 border-t border-border-subtle pt-2">
        <button
          type="button"
          onClick={openSettings}
          className="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm text-content-muted transition-colors hover:bg-surface-raised hover:text-content pointer-coarse:h-11"
        >
          <Settings size={16} aria-hidden />
          Settings
        </button>

        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm text-content-muted transition-colors hover:bg-surface-raised hover:text-content"
        >
          <ExternalLink size={16} aria-hidden />
          Source on GitHub
        </a>
      </div>
    </div>
  );
}

export { Sidebar };
