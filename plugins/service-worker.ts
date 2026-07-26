import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { Plugin } from "vite";
import { transformWithOxc } from "vite";

/**
 * Builds `src/service-worker.ts` into `dist/sw.js` with a real precache manifest.
 *
 * This is what `vite-plugin-pwa` was doing. Doing it here instead removed
 * `workbox-build` — source of every high-severity advisory in the project, and of the
 * Babel 7 pin that forced an npm override to install `@vitejs/plugin-react`.
 *
 * Transpiling uses `transformWithOxc`, which Vite already exports, so this costs no
 * new dependency. Output is a classic script: the worker imports nothing, so there is
 * no module syntax to emit, and classic workers are supported everywhere while module
 * workers still are not.
 */

type Options = {
  /** Path to the worker source, relative to the project root. */
  readonly source: string;
  /** Emitted filename. Must stay at the root so its scope covers the whole app. */
  readonly fileName?: string;
  /** Bundle outputs to keep out of the precache, matched against the file name. */
  readonly exclude?: readonly RegExp[];
  /** Extra URLs to precache, typically files copied verbatim from `public/`. */
  readonly publicAssets?: readonly string[];
  /**
   * The document served for navigations. Always precached.
   *
   * Included unconditionally because Vite's own HTML plugin emits `index.html` in a
   * later `generateBundle` hook than this one, so it is not yet a bundle key when the
   * manifest is assembled. Relying on the scan silently produced a worker with no
   * navigation fallback — the app installed, then showed nothing offline.
   */
  readonly appShell?: string;
};

/** Bundle outputs worth precaching; anything else is not part of the shell. */
const SHELL_EXTENSIONS = /\.(js|css|html|svg|woff2?)$/;

/** Files in `public/` that should never be precached. */
const PUBLIC_IGNORED = /(^|\/)\.|\.map$/;

async function listPublicFiles(dir: string): Promise<string[]> {
  const found: string[] = [];

  async function walk(current: string): Promise<void> {
    // No public directory is fine; there is simply nothing to add.
    const entries = await readdir(current, { withFileTypes: true }).catch(() => []);

    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }
      const url = `/${relative(dir, path).split(/[\\/]/).join("/")}`;
      if (!PUBLIC_IGNORED.test(url)) found.push(url);
    }
  }

  await walk(dir);
  return found.sort();
}

export function serviceWorker(options: Options): Plugin {
  const {
    source,
    fileName = "sw.js",
    exclude = [],
    publicAssets = [],
    appShell = "/index.html",
  } = options;

  let root = process.cwd();
  let publicDir = "public";

  return {
    name: "chat-buddy:service-worker",
    // Dev serves modules straight from source; a cache there only causes confusion.
    apply: "build",

    configResolved(config) {
      root = config.root;
      publicDir = config.publicDir;
    },

    async generateBundle(_outputOptions, bundle) {
      const fromBundle = Object.keys(bundle)
        .filter((name) => SHELL_EXTENSIONS.test(name))
        .filter((name) => !exclude.some((pattern) => pattern.test(name)))
        .map((name) => `/${name}`);

      const fromPublic = [...(await listPublicFiles(publicDir)), ...publicAssets];

      // Sorted and de-duplicated so the hash below depends on content, not on the
      // order the bundler happened to emit things in.
      const precache = [...new Set([appShell, ...fromBundle, ...fromPublic])].sort();

      const version = createHash("sha256")
        .update(precache.join("\n"))
        .digest("hex")
        .slice(0, 12);

      const workerSource = await readFile(join(root, source), "utf8");

      /*
       * Substitute before transpiling, so the injected values go through the same
       * syntax check as the rest of the file. The `declare const` lines in the source
       * exist purely to type these two.
       */
      const substituted = workerSource
        .replace(/\bdeclare const __SW_VERSION__: string;/, "")
        .replace(/\bdeclare const __SW_PRECACHE__: readonly string\[\];/, "")
        .replaceAll("__SW_VERSION__", JSON.stringify(version))
        .replaceAll("__SW_PRECACHE__", JSON.stringify(precache));

      const { code } = await transformWithOxc(substituted, source, {
        lang: "ts",
        target: "es2022",
      });

      this.emitFile({ type: "asset", fileName, source: code });

      this.info(
        `service worker: ${precache.length} files precached, version ${version}`,
      );
    },
  };
}
