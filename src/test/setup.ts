import { beforeEach } from "vitest";

/**
 * Installs a real in-memory `Storage` on `globalThis`.
 *
 * Node 25 exposes its own experimental `localStorage` global, which shadows the
 * one jsdom provides and throws unless the process was started with
 * `--localstorage-file`. Rather than depend on which implementation wins for a
 * given Node and jsdom pairing, the tests get a known-good one.
 */
class MemoryStorage implements Storage {
  #entries = new Map<string, string>();

  get length(): number {
    return this.#entries.size;
  }

  clear(): void {
    this.#entries.clear();
  }

  getItem(key: string): string | null {
    return this.#entries.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.#entries.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.#entries.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#entries.set(key, String(value));
  }
}

const storage = new MemoryStorage();

for (const target of ["localStorage", "sessionStorage"] as const) {
  Object.defineProperty(globalThis, target, {
    value: storage,
    configurable: true,
    writable: true,
  });
}

// Every test starts from empty storage without having to remember to clear it.
beforeEach(() => storage.clear());
