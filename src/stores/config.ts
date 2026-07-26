import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ReplySource } from "@/domain/message.ts";

export type ThemePreference = "light" | "dark" | "system";

type ConfigState = {
  /** What the person chose. `system` defers to the OS. */
  readonly theme: ThemePreference;
  /** Provider they last selected, or undefined to let tiering decide. */
  readonly preferredProviderId: ReplySource | undefined;
  /** Whether assistant replies are read aloud. */
  readonly speakReplies: boolean;
  /**
   * `voiceURI` of the chosen speech voice, or undefined to auto-select.
   *
   * Stored as the URI rather than the voice object, which is not serialisable, and
   * rather than the name, which is not unique across languages.
   */
  readonly voiceUri: string | undefined;
  /** Whether the desktop sidebar is collapsed to its rail. */
  readonly isSidebarCollapsed: boolean;

  setTheme(theme: ThemePreference): void;
  setPreferredProvider(id: ReplySource): void;
  toggleSpeakReplies(): void;
  setVoiceUri(uri: string | undefined): void;
  toggleSidebar(): void;
};

/**
 * Persisted UI preferences.
 *
 * `localStorage` here, deliberately, even though threads live in IndexedDB:
 * these are a handful of scalars that must be readable synchronously before
 * first paint, which is exactly what an async store cannot offer.
 */
export const useConfig = create<ConfigState>()(
  persist(
    (set) => ({
      theme: "system",
      preferredProviderId: undefined,
      speakReplies: false,
      voiceUri: undefined,
      isSidebarCollapsed: false,

      setTheme: (theme) => set({ theme }),
      setPreferredProvider: (preferredProviderId) => set({ preferredProviderId }),
      toggleSpeakReplies: () => set((state) => ({ speakReplies: !state.speakReplies })),
      setVoiceUri: (voiceUri) => set({ voiceUri }),
      toggleSidebar: () =>
        set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
    }),
    {
      /*
       * Deliberately still `:settings`, not `:config`, despite this module's name.
       *
       * The key is a storage contract with every browser that has already visited:
       * renaming it would silently discard everyone's saved theme, engine choice and
       * voice. The pre-paint script in `index.html` reads the same key, so the two
       * have to agree — and neither is worth a migration for cosmetics.
       */
      name: "chat-buddy:settings",
      version: 1,
    },
  ),
);

/*
 * Theme resolution.
 *
 * Tracked outside the store because it is not a preference — it is an
 * observation of the OS, and the store should not persist it.
 */

const darkQuery = globalThis.matchMedia?.("(prefers-color-scheme: dark)");

/**
 * Suppresses colour transitions for one frame while the theme swaps.
 *
 * Without this, every element carrying `transition-colors` animates from its old
 * colour to its new one. Because the two themes sit at opposite ends of the
 * lightness range, those interpolations pass through dark intermediate values and
 * read as a black flash across the UI. The swap should be instant; only
 * deliberate hover and focus transitions should animate.
 */
function applyTheme(resolved: "light" | "dark"): void {
  const root = document.documentElement;
  const wantsDark = resolved === "dark";
  if (root.classList.contains("dark") === wantsDark) return;

  // A data attribute rather than a class for the transient flag: it is a
  // one-off state marker, not a style hook, and keeping it out of `class`
  // leaves `dark` the only class the theme system touches.
  root.dataset.themeSwitching = "";
  root.classList.toggle("dark", wantsDark);

  // Two frames: one for the new variables to take effect, one to be sure the
  // suppressing rule was in force while they did.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      delete root.dataset.themeSwitching;
    });
  });
}

export function resolveTheme(theme: ThemePreference): "light" | "dark" {
  if (theme !== "system") return theme;
  return darkQuery?.matches ? "dark" : "light";
}

/**
 * Wires the theme preference to the document element.
 *
 * Called once from `main.tsx`. Kept out of module scope so importing this file
 * from a test has no side effects.
 */
export function startThemeSync(): () => void {
  applyTheme(resolveTheme(useConfig.getState().theme));

  const unsubscribe = useConfig.subscribe((state) => {
    applyTheme(resolveTheme(state.theme));
  });

  const onSystemChange = () => {
    // Only matters while following the system; re-resolving is harmless anyway.
    applyTheme(resolveTheme(useConfig.getState().theme));
  };

  darkQuery?.addEventListener("change", onSystemChange);

  return () => {
    unsubscribe();
    darkQuery?.removeEventListener("change", onSystemChange);
  };
}
