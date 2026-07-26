import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const BRAND_COLOR = "#6366f1";

const REACT_PACKAGES = new Set(["react", "react-dom", "scheduler"]);
const MOTION_PACKAGES = new Set([
  "motion",
  "framer-motion",
  "motion-dom",
  "motion-utils",
]);

/**
 * The markdown pipeline: react-markdown plus the unified/remark/micromark tree it
 * pulls in. Matched by pattern because that tree is dozens of small packages.
 */
const MARKDOWN_PACKAGE_PATTERN =
  /^(react-markdown|remark-.*|rehype-.*|unified|unist-.*|micromark.*|mdast-.*|hast-.*|vfile.*|@llm-ui\/.*|property-information|space-separated-tokens|comma-separated-tokens|html-url-attributes|character-entities.*|decode-named-character-reference|devlop|trim-lines|zwitch|longest-streak|ccount|escape-string-regexp|markdown-table|estree-.*|is-plain-obj|bail|extend|trough)$/;

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

export default defineConfig({
  plugins: [
    // The Babel plugin rather than the SWC one: Vite 8 on Rolldown recommends it,
    // and it is the only route to Babel-based transforms such as the React
    // Compiler, which SWC cannot host.
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Chat Buddy",
        short_name: "Chat Buddy",
        description:
          "A private-by-default chat companion that runs its language model entirely in your browser.",
        start_url: "/",
        display: "standalone",
        theme_color: BRAND_COLOR,
        background_color: "#0b0b12",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        /*
         * The WebLLM engine is a ~6 MB chunk that most visitors never load, and
         * the model weights it fetches are hundreds of megabytes more, cached by
         * the engine itself in the Cache API. Precaching any of that would make
         * a first visit pay for a feature it has not opted into. Excluded here so
         * the offline shell stays small; the chunk is still served and
         * HTTP-cached normally when someone does enable it.
         */
        globIgnores: ["**/web-llm-*.js", "**/*.map"],
        navigateFallback: "index.html",
      },
    }),
  ],
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
           * Vendor splits, so dependencies that change far less often than app
           * code stay cached across deploys.
           *
           * Matched on the full package boundary, not a prefix: `react` as a
           * prefix also matches `react-markdown`, which quietly pulled the whole
           * micromark/mdast parser stack into the chunk labelled "react".
           */
          const vendor = matchPackage(id);
          if (!vendor) return undefined;

          if (REACT_PACKAGES.has(vendor)) return "react";
          if (MOTION_PACKAGES.has(vendor)) return "motion";
          // The markdown pipeline is a large, self-contained dependency tree.
          if (MARKDOWN_PACKAGE_PATTERN.test(vendor)) return "markdown";

          return undefined;
        },
      },
    },
  },
  worker: {
    format: "es",
  },
});
