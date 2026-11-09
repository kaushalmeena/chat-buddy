import { useEffect } from "react";

import { Composer } from "@/components/composer.tsx";
import { Header } from "@/components/header.tsx";
import { Transcript } from "@/components/messages.tsx";
import { SettingsDialog } from "@/components/settings.tsx";
import { Sidebar } from "@/components/sidebar.tsx";
import { UndoToast } from "@/components/toast.tsx";
import { newConversation } from "@/stores/chat.ts";
import { useConfig } from "@/stores/config.ts";
import { closeDrawer, COMPOSER_ID, focusComposer, useUi } from "@/stores/ui.ts";

function App() {
  const isCollapsed = useConfig((state) => state.isSidebarCollapsed);
  const isDrawerOpen = useUi((state) => state.isDrawerOpen);

  useGlobalShortcuts();

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <a
        href={`#${COMPOSER_ID}`}
        // Parked above the viewport until focused; the first Tab stop on the page.
        className="fixed top-2 left-2 z-50 -translate-y-16 rounded-lg bg-surface px-3 py-2 text-sm font-medium text-content shadow-float focus:translate-y-0"
      >
        Skip to message box
      </a>

      {/*
       * Desktop sidebar. Collapsing transitions `width` to zero rather than
       * unmounting, so the thread list keeps its scroll position; `inert` keeps the
       * hidden contents out of the tab order while it is closed.
       */}
      <aside
        inert={isCollapsed}
        className={`hidden shrink-0 overflow-hidden border-r border-border-subtle bg-surface-raised/50 transition-[width] duration-200 ease-out-soft lg:block ${
          isCollapsed ? "w-0" : "w-72"
        }`}
      >
        <div className="h-full w-72">
          <Sidebar />
        </div>
      </aside>

      {/*
       * The same contents as an overlay drawer below `lg`. Kept mounted and moved
       * with a transform, so it animates both in and out without a JS animation
       * library on the critical path.
       */}
      <div
        inert={!isDrawerOpen}
        className={`fixed inset-0 z-40 lg:hidden ${isDrawerOpen ? "" : "pointer-events-none"}`}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label="Close menu"
          onClick={closeDrawer}
          className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${
            isDrawerOpen ? "opacity-100" : "opacity-0"
          }`}
        />
        <aside
          className={`relative h-full w-72 max-w-[85vw] border-r border-border-subtle bg-canvas shadow-float transition-transform duration-250 ease-out-soft ${
            isDrawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <Sidebar isDrawer />
        </aside>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <Header />

        <main className="flex min-h-0 flex-1 flex-col">
          <Transcript />

          <div className="shrink-0 px-3 pt-2 pb-3 sm:px-4 sm:pb-4">
            <div className="mx-auto max-w-3xl">
              <Composer />
            </div>
          </div>
        </main>
      </div>

      <SettingsDialog />
      <UndoToast />
    </div>
  );
}

/**
 * App-wide keyboard shortcuts.
 *
 * - Escape closes the mobile drawer (the settings dialog handles its own).
 * - Ctrl/Cmd + Shift + O starts a new chat, matching the convention other chat
 *   apps have trained people on.
 */
function useGlobalShortcuts(): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && useUi.getState().isDrawerOpen) {
        closeDrawer();
        return;
      }

      const isModifier = event.metaKey || event.ctrlKey;
      if (isModifier && event.shiftKey && event.key.toLowerCase() === "o") {
        event.preventDefault();
        newConversation();
        focusComposer();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);
}

export { App };
