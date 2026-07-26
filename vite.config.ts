import { fileURLToPath } from "node:url";
import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const BRAND_COLOR = "#6366f1";

export default defineConfig({
  plugins: [
    preact(),
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
    // The WebLLM chunk is legitimately multi-megabyte and legitimately lazy;
    // warning about it on every build would train us to ignore the warning.
    chunkSizeWarningLimit: 1024,
    rollupOptions: {
      output: {
        // Keep the heavy, optional inference engine out of the entry chunk so
        // first paint never waits on code most visitors will not run.
        manualChunks(id) {
          if (id.includes("@mlc-ai/web-llm")) return "web-llm";
          return undefined;
        },
      },
    },
  },
  worker: {
    format: "es",
  },
});
