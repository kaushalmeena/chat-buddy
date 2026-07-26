/**
 * Registers the service worker and surfaces updates.
 *
 * Replaces `virtual:pwa-register` from `vite-plugin-pwa`. The behaviour that plugin
 * gave us with `registerType: "prompt"` is the important part, and is reproduced here:
 * a new worker installs but does not take over until the person agrees, so an update
 * can never replace the app mid-reply.
 */

/** Where the build plugin emits the worker. Root scope, so it covers the whole app. */
const SCRIPT_URL = "/sw.js";

type Options = {
  /**
   * Called when a new version is installed and waiting. Return true to apply it.
   *
   * Defaults to `window.confirm`, which is a blunt instrument — but reloading
   * unprompted would discard an in-flight reply, and updating silently leaves someone
   * on stale code indefinitely. Replace with an in-app toast when there is one.
   */
  readonly onUpdateReady?: (() => boolean | Promise<boolean>) | undefined;
};

function promptByDefault(): boolean {
  return window.confirm("A new version of Chat Buddy is available. Reload?");
}

export function registerServiceWorker(options: Options = {}): void {
  // The worker is only built for production; in dev Vite serves modules directly.
  if (import.meta.env.DEV) return;
  if (!("serviceWorker" in navigator)) return;

  const onUpdateReady = options.onUpdateReady ?? promptByDefault;

  /*
   * A worker that is `waiting` or newly `installed` while another one still controls
   * the page is exactly the update case. Without a controller it is simply a first
   * visit, and there is nothing to announce.
   */
  const announce = async (worker: ServiceWorker): Promise<void> => {
    if (!navigator.serviceWorker.controller) return;
    if (!(await onUpdateReady())) return;

    // Reload once the new worker takes control, not before, so the page is served by
    // the version it is about to run.
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => window.location.reload(),
      { once: true },
    );

    worker.postMessage({ type: "SKIP_WAITING" });
  };

  // Registering after load keeps the worker's own fetches from competing with the
  // ones painting the page.
  window.addEventListener("load", () => {
    void (async () => {
      try {
        const registration = await navigator.serviceWorker.register(SCRIPT_URL);

        if (registration.waiting) {
          await announce(registration.waiting);
          return;
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;

          installing.addEventListener("statechange", () => {
            if (installing.state === "installed") void announce(installing);
          });
        });
      } catch (error) {
        // A failed registration costs offline support, nothing else. The app runs.
        console.error("[ServiceWorker] registration failed:", error);
      }
    })();
  });
}
