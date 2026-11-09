import { PanelLeftClose, PanelLeftOpen, SquarePen } from "lucide-react";

import { BrandMark } from "@/components/BrandMark.tsx";
import { EngineBadge } from "@/components/EngineBadge.tsx";
import { newConversation, selectActiveConversation, useChat } from "@/stores/chat.ts";
import { useConfig } from "@/stores/config.ts";
import { openDrawer, useUi } from "@/stores/ui.ts";

const ICON_BUTTON =
  "grid size-9 shrink-0 place-items-center rounded-lg text-content-muted transition-colors hover:bg-surface-raised hover:text-content pointer-coarse:size-11";

/**
 * Top bar of the conversation column: navigation on the left, the active thread's
 * title in the middle, and the engine in use on the right.
 */
function Header() {
  const isCollapsed = useConfig((state) => state.isSidebarCollapsed);
  const toggleSidebar = useConfig((state) => state.toggleSidebar);
  const isDrawerOpen = useUi((state) => state.isDrawerOpen);
  const title = useChat((state) => selectActiveConversation(state).title);
  const hasMessages = useChat(
    (state) => selectActiveConversation(state).messages.length > 0,
  );

  const sidebarLabel = isCollapsed ? "Expand sidebar" : "Collapse sidebar";

  return (
    <header className="flex h-14 shrink-0 items-center gap-1.5 border-b border-border-subtle bg-canvas px-2 sm:px-3">
      {/* Below `lg` this opens the drawer; above it, it collapses the sidebar. */}
      <button
        type="button"
        onClick={openDrawer}
        aria-label="Open menu"
        aria-expanded={isDrawerOpen}
        className={`${ICON_BUTTON} lg:hidden`}
      >
        <PanelLeftOpen size={18} aria-hidden />
      </button>

      <button
        type="button"
        onClick={toggleSidebar}
        aria-label={sidebarLabel}
        aria-expanded={!isCollapsed}
        title={sidebarLabel}
        className={`${ICON_BUTTON} hidden lg:grid`}
      >
        {isCollapsed ? (
          <PanelLeftOpen size={18} aria-hidden />
        ) : (
          <PanelLeftClose size={18} aria-hidden />
        )}
      </button>

      {/* New chat stays one click away whenever the sidebar is not showing it. */}
      <button
        type="button"
        onClick={newConversation}
        aria-label="New chat"
        title="New chat (Ctrl+Shift+O)"
        className={`${ICON_BUTTON} ${isCollapsed ? "" : "lg:hidden"}`}
      >
        <SquarePen size={17} aria-hidden />
      </button>

      <h1 className="flex min-w-0 flex-1 items-center gap-2 px-1">
        <BrandMark
          size={22}
          className={`shrink-0 rounded-md ${isCollapsed ? "" : "lg:hidden"}`}
        />
        <span className="truncate text-sm font-medium text-content">
          {hasMessages ? title : "Chat Buddy"}
        </span>
      </h1>

      <EngineBadge />
    </header>
  );
}

export { Header };
