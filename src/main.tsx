import { render } from "preact";
import { startChatPersistence } from "./state/chat-store.ts";
import { startSettingsSync } from "./state/settings-store.ts";
import "./styles/global.css";
import { registerServiceWorker } from "./service-worker.ts";
import { App } from "./ui/app.tsx";

/**
 * Entry point. Wires up the side-effecting subscriptions, mounts the app, and
 * does nothing else — the stores are imported for their exports, not for
 * import-time behaviour, so each of these has to be started explicitly.
 */

const root = document.querySelector("#app");
if (!root) throw new Error('Missing mount point: expected an element with id "app".');

startSettingsSync();
startChatPersistence();

render(<App />, root);

registerServiceWorker();
