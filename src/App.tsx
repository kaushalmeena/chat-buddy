import { ExternalLink, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/BrandMark.tsx";
import { Composer } from "@/components/Composer.tsx";
import { ProviderPicker } from "@/components/ProviderPicker.tsx";
import { ThemeToggle } from "@/components/ThemeToggle.tsx";
import { ThreadList } from "@/components/ThreadList.tsx";
import { Transcript } from "@/components/Transcript.tsx";
import { VoicePicker } from "@/components/VoicePicker.tsx";
import { initialiseProviders, useChat } from "@/stores/chat.ts";
import { useConfig } from "@/stores/config.ts";

const REPO_URL = "https://github.com/kaushalmeena/chat-buddy";

const SIDEBAR_WIDTH_PX = 288;

function App() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const isCollapsed = useConfig((state) => state.isSidebarCollapsed);
  const toggleSidebar = useConfig((state) => state.toggleSidebar);

  useEffect(() => {
    void initialiseProviders();
  }, []);

  // Escape closes the mobile drawer — the expected gesture for an overlay, and
  // the only way out for keyboard users.
  useEffect(() => {
    if (!isDrawerOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsDrawerOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isDrawerOpen]);

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      {/*
       * Desktop sidebar.
       *
       * Collapsing animates `width` to zero rather than unmounting, so the
       * transcript reflows in step with it and the thread list keeps its scroll
       * position across a collapse and expand. `inert` keeps the hidden contents
       * out of the tab order and the accessibility tree while it is closed.
       */}
      <motion.aside
        initial={false}
        animate={{ width: isCollapsed ? 0 : SIDEBAR_WIDTH_PX }}
        transition={{ type: "spring", stiffness: 380, damping: 34 }}
        inert={isCollapsed}
        className="hidden shrink-0 overflow-hidden border-r border-border-subtle bg-surface-raised/40 lg:block"
      >
        <div
          className="flex h-full flex-col gap-5 p-3"
          style={{ width: SIDEBAR_WIDTH_PX }}
        >
          <SidebarContents />
        </div>
      </motion.aside>

      {/* The same contents as an overlay drawer below `lg`. */}
      <AnimatePresence>
        {isDrawerOpen && (
          <div className="fixed inset-0 z-40 flex lg:hidden">
            <motion.button
              type="button"
              aria-label="Close menu"
              onClick={() => setIsDrawerOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-black/40"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 420, damping: 38 }}
              className="relative flex w-72 max-w-[85vw] flex-col gap-5 border-r border-border-subtle bg-canvas p-3 shadow-xl"
            >
              <SidebarContents onNavigate={() => setIsDrawerOpen(false)} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
          {/* Below `lg` this opens the drawer; above it, it collapses the sidebar. */}
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            aria-label="Open menu"
            aria-expanded={isDrawerOpen}
            className="grid size-9 place-items-center rounded-lg text-content-muted transition-colors hover:bg-surface-raised hover:text-content lg:hidden"
          >
            <PanelLeftOpen size={18} aria-hidden />
          </button>

          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!isCollapsed}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden size-9 place-items-center rounded-lg text-content-muted transition-colors hover:bg-surface-raised hover:text-content lg:grid"
          >
            {isCollapsed ? (
              <PanelLeftOpen size={18} aria-hidden />
            ) : (
              <PanelLeftClose size={18} aria-hidden />
            )}
          </button>

          {/* The wordmark moves into the header whenever the sidebar is not showing it. */}
          <AnimatePresence initial={false}>
            {isCollapsed && (
              <motion.span
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                transition={{ duration: 0.18 }}
                className="hidden min-w-0 items-center gap-2 lg:flex"
              >
                <BrandMark size={22} className="rounded-md" />
                <span className="truncate font-semibold tracking-tight">
                  Chat Buddy
                </span>
              </motion.span>
            )}
          </AnimatePresence>

          <h1 className="flex min-w-0 items-center gap-2 lg:hidden">
            <BrandMark size={22} className="rounded-md" />
            <span className="truncate font-semibold tracking-tight">Chat Buddy</span>
          </h1>

          <div className="flex-1" />

          <ActiveEngineBadge />
        </header>

        <main className="flex min-h-0 flex-1 flex-col">
          <Transcript />

          <div className="shrink-0 px-3 pb-4 pt-2">
            <div className="mx-auto max-w-3xl">
              <Composer />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function SidebarContents({
  onNavigate,
}: {
  readonly onNavigate?: (() => void) | undefined;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="flex items-center gap-2">
          <BrandMark size={26} className="rounded-lg" />
          <span className="font-semibold tracking-tight">Chat Buddy</span>
        </span>

        {onNavigate && (
          <button
            type="button"
            onClick={onNavigate}
            aria-label="Close menu"
            className="grid size-8 place-items-center rounded-lg text-content-muted hover:text-content lg:hidden"
          >
            <X size={17} aria-hidden />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1">
        <ThreadList onNavigate={onNavigate} />
      </div>

      <div className="flex flex-col gap-4 border-t border-border-subtle pt-4">
        <ProviderPicker />
        <VoicePicker />
        <ThemeToggle />

        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 px-1 text-xs text-content-faint transition-colors hover:text-content-muted"
        >
          <ExternalLink size={14} aria-hidden />
          Source on GitHub
        </a>
      </div>
    </>
  );
}

/** Compact reminder of which engine is answering. */
function ActiveEngineBadge() {
  const provider = useChat((state) => state.activeProvider);
  if (!provider) return null;

  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.22 }}
      className="flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface px-2.5 py-1 text-xs text-content-muted"
    >
      <span className="size-1.5 rounded-full bg-success" aria-hidden />
      <span className="max-w-40 truncate">{provider.label}</span>
    </motion.span>
  );
}

export { App };
