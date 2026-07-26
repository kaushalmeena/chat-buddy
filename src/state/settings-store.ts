import { computed, effect, signal } from "@preact/signals";
import type { ReplySource } from "@/domain/message.ts";

export type ThemePreference = "light" | "dark" | "system";

const THEME_KEY = "chat-buddy:theme";
const PROVIDER_KEY = "chat-buddy:provider";
const SPEAK_KEY = "chat-buddy:speak-replies";

function read(key: string): string | undefined {
  try {
    return globalThis.localStorage?.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function write(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Storage unavailable; the preference simply will not survive a reload.
  }
}

function readTheme(): ThemePreference {
  const stored = read(THEME_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

function readProvider(): ReplySource | undefined {
  const stored = read(PROVIDER_KEY);
  return stored === "prompt-api" || stored === "web-llm" || stored === "rules"
    ? stored
    : undefined;
}

/**
 * The theme the person chose. `system` defers to the OS, which the media query
 * below tracks live so a mid-session OS switch is picked up without a reload.
 */
export const themePreference = signal<ThemePreference>(readTheme());

const systemPrefersDark = signal(
  globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false,
);

globalThis
  .matchMedia?.("(prefers-color-scheme: dark)")
  .addEventListener("change", (event) => {
    systemPrefersDark.value = event.matches;
  });

/** The theme actually in force, with `system` resolved. */
export const resolvedTheme = computed<"light" | "dark">(() => {
  const preference = themePreference.value;
  if (preference !== "system") return preference;
  return systemPrefersDark.value ? "dark" : "light";
});

/**
 * The provider the person selected, or `undefined` to let tiering decide. Read
 * once at startup by the chat store.
 */
export const preferredProviderId = signal<ReplySource | undefined>(readProvider());

/** Whether assistant replies are read aloud as they arrive. */
export const speakReplies = signal(read(SPEAK_KEY) === "true");

export function setThemePreference(preference: ThemePreference): void {
  themePreference.value = preference;
}

export function setPreferredProvider(id: ReplySource): void {
  preferredProviderId.value = id;
}

export function toggleSpeakReplies(): void {
  speakReplies.value = !speakReplies.value;
}

/**
 * Wires the settings signals to the DOM and to storage.
 *
 * Called once from `main.tsx`. Kept out of module scope so importing this file
 * — from a test, say — has no side effects.
 */
export function startSettingsSync(): void {
  effect(() => {
    document.documentElement.dataset.theme = resolvedTheme.value;
  });

  effect(() => {
    write(THEME_KEY, themePreference.value);
  });

  effect(() => {
    const id = preferredProviderId.value;
    if (id) write(PROVIDER_KEY, id);
  });

  effect(() => {
    write(SPEAK_KEY, String(speakReplies.value));
  });
}
