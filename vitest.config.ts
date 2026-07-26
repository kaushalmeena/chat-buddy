import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Kept separate from `vite.config.ts` so the app build does not carry the test
 * runner's config, and so the PWA and Tailwind plugins — neither of which the
 * unit tests need — stay out of the test pipeline.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    // Tests live in a `__tests__` folder beside the code they cover.
    include: ["src/**/__tests__/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    restoreMocks: true,
  },
});
