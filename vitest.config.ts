import { fileURLToPath } from "node:url";
import preact from "@preact/preset-vite";
import { defineConfig } from "vitest/config";

/**
 * Kept separate from `vite.config.ts` so the app build does not carry the test
 * runner's config, and so the PWA and Tailwind plugins — neither of which the
 * unit tests need — stay out of the test pipeline.
 */
export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./src/test/setup.ts"],
    restoreMocks: true,
  },
});
