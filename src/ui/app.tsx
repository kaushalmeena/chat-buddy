import { ExternalLink, PanelLeft, X } from "lucide";
import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";
import { activeProvider, initialiseProviders } from "@/state/chat-store.ts";
import { BrandMark } from "./components/brand-mark.tsx";
import { Composer } from "./components/composer.tsx";
import { Icon } from "./components/icon.tsx";
import { ProviderPicker } from "./components/provider-picker.tsx";
import { ThemeToggle } from "./components/theme-toggle.tsx";
import { ThreadList } from "./components/thread-list.tsx";
import { Transcript } from "./components/transcript.tsx";

const REPO_URL = "https://github.com/kaushalmeena/chat-buddy";

export function App(): JSX.Element {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    void initialiseProviders();
  }, []);

  // Escape closes the mobile drawer, which is the expected gesture for an
  // overlay and the only way out for keyboard users.
  useEffect(() => {
    if (!isDrawerOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsDrawerOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isDrawerOpen]);

  return (
    <div class="flex h-dvh overflow-hidden bg-canvas">
      {/* Persistent sidebar from `lg` up. */}
      <aside class="hidden w-72 shrink-0 flex-col gap-5 border-r border-border-subtle bg-surface-raised/40 p-3 lg:flex">
        <SidebarContents />
      </aside>

      {/* The same contents as an overlay drawer below `lg`. */}
      {isDrawerOpen && (
        <div class="fixed inset-0 z-40 flex lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setIsDrawerOpen(false)}
            class="absolute inset-0 bg-black/40"
          />
          <aside class="relative flex w-72 max-w-[85vw] flex-col gap-5 border-r border-border-subtle bg-canvas p-3 shadow-xl">
            <SidebarContents onNavigate={() => setIsDrawerOpen(false)} />
          </aside>
        </div>
      )}

      <div class="flex min-w-0 flex-1 flex-col">
        <header class="flex h-14 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            aria-label="Open menu"
            aria-expanded={isDrawerOpen}
            class="grid size-9 place-items-center rounded-lg text-content-muted transition-colors hover:bg-surface-raised hover:text-content lg:hidden"
          >
            <Icon icon={PanelLeft} size={18} />
          </button>

          <h1 class="flex min-w-0 items-center gap-2 lg:hidden">
            <BrandMark size={22} class="rounded-md" />
            <span class="truncate font-semibold tracking-tight">Chat Buddy</span>
          </h1>

          <div class="flex-1" />

          <ActiveEngineBadge />
        </header>

        <main class="flex min-h-0 flex-1 flex-col">
          <Transcript />

          <div class="shrink-0 px-3 pb-4 pt-2">
            <div class="mx-auto max-w-3xl">
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
}): JSX.Element {
  return (
    <>
      <div class="flex items-center justify-between gap-2 px-1">
        <span class="flex items-center gap-2">
          <BrandMark size={26} class="rounded-lg" />
          <span class="font-semibold tracking-tight">Chat Buddy</span>
        </span>

        {onNavigate && (
          <button
            type="button"
            onClick={onNavigate}
            aria-label="Close menu"
            class="grid size-8 place-items-center rounded-lg text-content-muted hover:text-content lg:hidden"
          >
            <Icon icon={X} size={17} />
          </button>
        )}
      </div>

      <div class="min-h-0 flex-1">
        <ThreadList onNavigate={onNavigate} />
      </div>

      <div class="flex flex-col gap-4 border-t border-border-subtle pt-4">
        <ProviderPicker />
        <ThemeToggle />

        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          class="flex items-center gap-2 px-1 text-xs text-content-faint transition-colors hover:text-content-muted"
        >
          <Icon icon={ExternalLink} size={14} />
          Source on GitHub
        </a>
      </div>
    </>
  );
}

/** Compact reminder of which engine is answering, for the mobile header. */
function ActiveEngineBadge(): JSX.Element | null {
  const provider = activeProvider.value;
  if (!provider) return null;

  return (
    <span class="flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface px-2.5 py-1 text-xs text-content-muted">
      <span class="size-1.5 rounded-full bg-success" aria-hidden="true" />
      <span class="max-w-40 truncate">{provider.label}</span>
    </span>
  );
}
