import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { LocalRuleProvider } from "../rules.ts";

const turns = [{ role: "user" as const, content: "what can you do?" }];

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
}

/** Runs a generation, recording when each chunk arrived on the fake clock. */
async function collect(signal = new AbortController().signal) {
  const arrivals: { at: number; chunk: string }[] = [];
  const start = Date.now();
  const done = (async () => {
    for await (const chunk of new LocalRuleProvider().generate({ turns, signal })) {
      arrivals.push({ at: Date.now() - start, chunk });
    }
  })();
  return { arrivals, done };
}

describe("LocalRuleProvider pacing", () => {
  // The provider imports the engine on first use; load it before the fake clock
  // starts, as it would already be cached in the app after the first reply.
  beforeAll(async () => {
    await import("@/engine/rules/reply.ts");
  });

  beforeEach(() => {
    vi.useFakeTimers();
    setHidden(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    setHidden(false);
  });

  it("pauses to 'think' before the first word, then streams word by word", async () => {
    const { arrivals, done } = await collect();

    await vi.advanceTimersByTimeAsync(200);
    expect(arrivals).toHaveLength(0);

    await vi.runAllTimersAsync();
    await done;

    expect(arrivals[0]?.at).toBeGreaterThanOrEqual(260);
    expect(arrivals.length).toBeGreaterThan(10);
    // Words arrive spread out, not in one burst.
    expect((arrivals.at(-1)?.at ?? 0) - (arrivals[0]?.at ?? 0)).toBeGreaterThan(300);
  });

  it("does not pause in a hidden tab, where timers are throttled", async () => {
    setHidden(true);
    const { arrivals, done } = await collect();

    await done;

    expect(arrivals.length).toBeGreaterThan(10);
    expect(arrivals.every((arrival) => arrival.at === 0)).toBe(true);
  });

  it("stops at once when aborted mid-pause", async () => {
    const controller = new AbortController();
    const { arrivals, done } = await collect(controller.signal);

    await vi.advanceTimersByTimeAsync(100);
    controller.abort(new DOMException("Stopped by user.", "AbortError"));

    await expect(done).rejects.toMatchObject({ name: "AbortError" });
    expect(arrivals).toHaveLength(0);
  });
});
