import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { ReplySource } from "@/domain/message.ts";
import { DEFAULT_MODEL_ID } from "@/engine/providers/models.ts";

export type ThemePreference = "light" | "dark" | "system";

/**
 * Accent palettes, defined in `global.css`. The pre-paint script in `index.html`
 * keeps its own copy of this list, so the two must change together.
 */
export const ACCENTS = ["teal", "blue", "green", "orange", "pink"] as const;

export type Accent = (typeof ACCENTS)[number];

export function isAccent(value: unknown): value is Accent {
  return typeof value === "string" && (ACCENTS as readonly string[]).includes(value);
}

type ConfigState = {
  /** What the person chose. `system` defers to the OS. */
  readonly theme: ThemePreference;
  /**
   * Accent palette. Undefined only until first paint: a first visit is dealt one at
   * random by `index.html`, and `startThemeSync` persists that choice.
   */
  readonly accent: Accent | undefined;
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
  /** Which local (WebLLM) model to run, from `LOCAL_MODELS`. */
  readonly localModelId: string;
  /** Whether the desktop sidebar is collapsed to its rail. */
  readonly isSidebarCollapsed: boolean;

  setTheme(theme: ThemePreference): void;
  setAccent(accent: Accent): void;
  setPreferredProvider(id: ReplySource): void;
  toggleSpeakReplies(): void;
  setVoiceUri(uri: string | undefined): void;
  toggleSidebar(): void;
  setLocalModel(id: string): void;
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
      accent: undefined,
      preferredProviderId: undefined,
      speakReplies: false,
      voiceUri: undefined,
      isSidebarCollapsed: false,
      localModelId: DEFAULT_MODEL_ID,

      setTheme: (theme) => set({ theme }),
      setAccent: (accent) => set({ accent }),
      setPreferredProvider: (preferredProviderId) => set({ preferredProviderId }),
      toggleSpeakReplies: () => set((state) => ({ speakReplies: !state.speakReplies })),
      setVoiceUri: (voiceUri) => set({ voiceUri }),
      setLocalModel: (localModelId) => set({ localModelId }),
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

function applyAccent(accent: Accent): void {
  document.documentElement.dataset.accent = accent;
}

/**
 * Persists the accent the pre-paint script dealt on a first visit, so it stays the
 * same on the next one. The store only writes on change, so without this the random
 * pick would be redrawn every visit until the person chose one themselves.
 */
function adoptAccent(): void {
  const { accent, setAccent } = useConfig.getState();
  if (accent) {
    applyAccent(accent);
    return;
  }

  const dealt = document.documentElement.dataset.accent;
  setAccent(isAccent(dealt) ? dealt : ACCENTS[0]);
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
  adoptAccent();

  const unsubscribe = useConfig.subscribe((state) => {
    applyTheme(resolveTheme(state.theme));
    if (state.accent) applyAccent(state.accent);
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
