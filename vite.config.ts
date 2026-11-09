import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { serviceWorker } from "./plugins/service-worker.ts";

/*
 * Vendor chunk assignment.
 *
 * Only React gets a named chunk: it changes far less often than app code, so it
 * stays cached across deploys. Everything else is left to Rolldown's own splitting
 * on purpose. A catch-all `vendor` chunk used to sit here, and it dragged every
 * lazily imported dependency — the whole react-markdown stack — onto the critical
 * path, because a chunk is loaded whole the moment anything in it is needed.
 */
const REACT_PACKAGES = new Set(["react", "react-dom", "scheduler"]);

/**
 * Extracts the installed package name from a module id, handling scopes.
 * Returns undefined for first-party source.
 */
function matchPackage(id: string): string | undefined {
  const marker = "/node_modules/";
  const index = id.lastIndexOf(marker);
  if (index === -1) return undefined;

  const rest = id.slice(index + marker.length);
  const segments = rest.split("/");

  return segments[0]?.startsWith("@")
    ? `${segments[0]}/${segments[1] ?? ""}`
    : segments[0];
}

/*
 * Where the app will be served from.
 *
 * GitHub Pages puts a project site under `/<repo>/`, not the domain root, so every
 * absolute URL the app emits has to carry that prefix — the bundle's asset paths, the
 * service worker's precache list and scope, the manifest, all of it. Vite handles the
 * bundle; the rest is handled explicitly below and in the worker.
 *
 * Defaults to `/` so a local build and `vite preview` behave normally. The deploy
 * workflow sets `BASE_PATH` from `actions/configure-pages`, which reports `/<repo>` for
 * a project site and an empty string for a custom domain — hence `||` rather than `??`,
 * since an empty string is not nullish but does mean "serve from the root".
 *
 * The trailing slash is added here rather than left to Vite. Vite normalises it when
 * rewriting asset URLs, but `import.meta.env.BASE_URL` keeps whatever it was given — so
 * a `BASE_PATH` of `/chat-buddy` produced a correct-looking bundle and a service worker
 * registration for `/chat-buddysw.js`, which 404'd in production.
 */
function normaliseBase(value: string): string {
  if (value === "" || value === "/") return "/";
  const leading = value.startsWith("/") ? value : `/${value}`;
  return leading.endsWith("/") ? leading : `${leading}/`;
}

const base = normaliseBase(process.env.BASE_PATH ?? "");

const plugins = [
  react(),
  tailwindcss(),
  serviceWorker({
    source: "worker/service-worker.ts",
    /*
     * The WebLLM engine is a ~6 MB chunk most visitors never load, and the model
     * weights it fetches are hundreds of megabytes more, cached by the engine
     * itself. Precaching any of it would make a first visit pay for a feature
     * nobody opted into. It is still served and HTTP-cached normally.
     */
    exclude: [/^assets\/web-llm-/, /\.map$/],
  }),
];

export default defineConfig({
  base,
  plugins,
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    target: "es2022",
    sourcemap: true,
    /*
     * Set above the WebLLM chunk, which is legitimately multi-megabyte and
     * legitimately lazy. A warning that fires on every single build is one
     * everybody learns to scroll past, which is worse than no warning — and the
     * number that actually matters, the entry chunk, is two orders of magnitude
     * below this.
     */
    chunkSizeWarningLimit: 7 * 1024,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Keep the heavy, optional inference engine out of the entry chunk so
          // first paint never waits on code most visitors will not run.
          if (id.includes("@mlc-ai/web-llm")) return "web-llm";

          /*
           * Matched on the full package boundary, not a prefix: `react` as a prefix
           * also matches `react-markdown`, which once pulled the whole
           * micromark/mdast parser stack into the chunk labelled "react".
           */
          const vendor = matchPackage(id);
          if (vendor && REACT_PACKAGES.has(vendor)) return "react";
          return undefined;
        },
      },
    },
  },
  worker: {
    format: "es",
  },
});
