import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { hydrate } from "@/stores/chat.ts";
import { startThemeSync } from "@/stores/config.ts";
import "./styles/global.css";
import { App } from "./App.tsx";
import { registerServiceWorker } from "./register-sw.ts";

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

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerServiceWorker();
