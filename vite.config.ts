import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, lazyPlugins } from "vite-plus";

import { serviceWorker } from "./plugins/service-worker.ts";

/*
 * Vendor chunk assignment.
 *
 * Two small explicit sets, and everything else in `node_modules` falls into one
 * `vendor` chunk. Naming what goes *in* a chunk only works for dependencies with few,
 * stable package names, which React and Motion have and the markdown pipeline
 * emphatically does not: react-markdown pulls in around eighty packages across the
 * unified, remark, micromark, mdast and hast families.
 *
 * A hand-maintained list of those was the previous approach, and it had already
 * drifted — `style-to-js`, `dequal`, `is-alphabetical` and several others were absent,
 * so they silently landed in the entry chunk. An allow-list of that shape cannot
 * survive a dependency update. Inverting the rule removes the maintenance entirely.
 */
const REACT_PACKAGES = new Set(["react", "react-dom", "scheduler"]);
const MOTION_PACKAGES = new Set([
  "motion",
  "framer-motion",
  "motion-dom",
  "motion-utils",
]);

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

/*
 * Generated or vendored output that neither the linter nor the formatter should
 * walk. `dev-dist` and `public/icons` are written by the service-worker plugin and
 * `npm run icons` respectively, so both reappear on any clean build.
 */
const IGNORED_PATHS = ["dist/**", "dev-dist/**", "public/icons/**", "coverage/**"];

/*
 * `lazyPlugins` returns `undefined` when Vite+ loads this config only to read a
 * non-plugin block — `vp check`, `vp lint` and `vp fmt` all do — so those commands
 * never pay to construct the plugin chain. That puts `undefined` in its return
 * type, which `exactOptionalPropertyTypes` will not accept for an optional
 * `plugins?`. Spreading leaves the key absent in that case rather than present
 * and set to `undefined`, which is what the option actually means.
 */
const lazy = lazyPlugins(() => [
  // The Babel plugin rather than the SWC one: Vite 8 on Rolldown recommends it,
  // and it is the only route to Babel-based transforms such as the React
  // Compiler, which SWC cannot host.
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
]);

const plugins = lazy ? { plugins: lazy } : {};

export default defineConfig({
  /*
   * Formatting, ported from the `biome.json` this project used before Vite+.
   * Oxfmt is Prettier-shaped, so the Biome names map onto Prettier's: `lineWidth`
   * became `printWidth`, `quoteStyle: "double"` became `singleQuote: false`, and
   * so on. `sortImports` replaces Biome's `organizeImports` assist action.
   */
  fmt: {
    ignorePatterns: IGNORED_PATHS,
    printWidth: 88,
    tabWidth: 2,
    useTabs: false,
    semi: true,
    singleQuote: false,
    trailingComma: "all",
    arrowParens: "always",
    sortImports: {},
  },
  lint: {
    ignorePatterns: IGNORED_PATHS,
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    /*
     * `react` carries the hooks rules and `unicorn` the filename rule; neither is
     * on by default. The TypeScript and oxc plugins are, so they stay unlisted.
     */
    plugins: ["react", "unicorn", "import", "promise"],
    // Declared by the Prompt API, which ships without ambient types here.
    globals: { LanguageModel: "readonly" },
    options: { typeAware: true, typeCheck: true },
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      // Biome's `correctness` selections.
      "typescript/no-unused-vars": "error",
      "react-hooks/exhaustive-deps": "warn",
      // Biome's `style` selections.
      "prefer-const": "error",
      "typescript/consistent-type-imports": "error",
      "typescript/no-non-null-assertion": "error",
      // Biome's `suspicious` selections.
      "typescript/no-explicit-any": "error",
      "no-console": ["error", { allow: ["warn", "error"] }],
      // Type-aware, so it depends on `options.typeAware` above.
      "typescript/no-floating-promises": "error",
    },
    overrides: [
      {
        // Build scripts report progress on stdout.
        files: ["scripts/**"],
        rules: { "no-console": "off" },
      },
      {
        // Components are `PascalCase.tsx`, except for non-component helpers.
        files: ["src/components/**"],
        rules: {
          "unicorn/filename-case": [
            "error",
            { cases: { pascalCase: true, camelCase: true } },
          ],
        },
      },
      {
        // Hooks are `useThing.ts`.
        files: ["src/hooks/**"],
        rules: {
          "unicorn/filename-case": ["error", { cases: { camelCase: true } }],
        },
      },
    ],
  },
  base,
  ...plugins,
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
           * Vendor splits, so dependencies that change far less often than app code
           * stay cached across deploys.
           *
           * Matched on the full package boundary, not a prefix: `react` as a prefix
           * also matches `react-markdown`, which once pulled the whole
           * micromark/mdast parser stack into the chunk labelled "react".
           */
          const vendor = matchPackage(id);
          if (!vendor) return undefined;

          if (REACT_PACKAGES.has(vendor)) return "react";
          if (MOTION_PACKAGES.has(vendor)) return "motion";

          // Everything else third-party. No list to keep up to date.
          return "vendor";
        },
      },
    },
  },
  worker: {
    format: "es",
  },
});
