import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { hydrate, initialiseProviders } from "@/stores/chat.ts";
import { startThemeSync } from "@/stores/config.ts";

import "./styles/global.css";
import { App } from "./app.tsx";
import { preloadRichText } from "./components/prose.tsx";
import { registerServiceWorker } from "./pwa.ts";

/**
 * Entry point. Starts the side-effecting subscriptions, mounts the app, and does
 * nothing else — the stores are imported for their exports, not for import-time
 * behaviour, so each of these has to be started explicitly.
 */

const container = document.querySelector("#app");
if (!container) {
  throw new Error('Missing mount point: expected an element with id "app".');
}

startThemeSync();

// Threads live in IndexedDB, so reading them is asynchronous. Deliberately not
// awaited: the app renders immediately with an empty thread and swaps in the
// stored history when it arrives, rather than holding first paint on a disk read.
void hydrate();

// Once per page load, here rather than in a component effect: StrictMode (and any
// remount) would otherwise probe every provider twice.
void initialiseProviders();

// Fetch the markdown chunk in parallel with the IndexedDB read, so stored replies
// render formatted on first paint rather than reflowing from plain text.
preloadRichText();

// The built-in conversation engine is loaded on first use; warm it once the
// browser is idle so even the first reply pays nothing for it.
const whenIdle =
  globalThis.requestIdleCallback ?? ((callback: () => void) => setTimeout(callback, 1));
whenIdle(() => void import("@/engine/rules/reply.ts"));

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerServiceWorker();
