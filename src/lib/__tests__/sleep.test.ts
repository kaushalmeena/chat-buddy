import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sleep } from "../sleep.ts";

describe("sleep", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("resolves after the given time", async () => {
    let isDone = false;
    void sleep(100).then(() => {
      isDone = true;
      return undefined;
    });

    await vi.advanceTimersByTimeAsync(99);
    expect(isDone).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(isDone).toBe(true);
  });

  it("rejects as soon as the signal aborts", async () => {
    const controller = new AbortController();
    const waiting = sleep(10_000, controller.signal);

    controller.abort(new DOMException("Stopped", "AbortError"));

    await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects immediately for an already-aborted signal", async () => {
    await expect(sleep(10, AbortSignal.abort())).rejects.toBeDefined();
  });
});
