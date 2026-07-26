import { registerSW } from "virtual:pwa-register";

/**
 * Registers the Workbox-generated service worker.
 *
 * This replaces the hand-written `sw.js` from v1, which had a real bug: its
 * `activate` handler computed the set of caches to keep as `[RUNTIME]`, omitting
 * the very cache `install` had just populated — so the precached app shell was
 * deleted the moment the worker activated, and offline never worked.
 *
 * `registerType: "prompt"` in the Vite config means updates are not applied
 * behind the user's back mid-conversation.
 */
export function registerServiceWorker(): void {
  if (import.meta.env.DEV) return;

  const updateSW = registerSW({
    onNeedRefresh() {
      // A blocking `confirm` is a poor pattern, but reloading unprompted would
      // discard an in-flight reply. Replace with an in-app toast when one exists.
      if (window.confirm("A new version of Chat Buddy is available. Reload?")) {
        void updateSW(true);
      }
    },
    onRegisterError(error: unknown) {
      console.error("[ServiceWorker] registration failed:", error);
    },
  });
}
