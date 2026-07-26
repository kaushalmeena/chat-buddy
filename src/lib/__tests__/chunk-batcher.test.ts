import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChunkBatcher } from "@/lib/chunk-batcher.ts";

/**
 * `requestAnimationFrame` is driven manually so the batching behaviour can be
 * observed frame by frame rather than raced against a real clock.
 */
let queued: Array<() => void> = [];

function runFrame(): void {
  const callbacks = queued;
  queued = [];
  for (const callback of callbacks) callback();
}

beforeEach(() => {
  queued = [];

  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
    queued.push(callback);
    return queued.length;
  });

  vi.stubGlobal("cancelAnimationFrame", (handle: number) => {
    queued.splice(handle - 1, 1);
  });
});

describe("createChunkBatcher", () => {
  it("does not commit until a frame runs", () => {
    const commit = vi.fn();
    const batcher = createChunkBatcher(commit);

    batcher.push("a");
    expect(commit).not.toHaveBeenCalled();

    runFrame();
    expect(commit).toHaveBeenCalledExactlyOnceWith("a");
  });

  it("coalesces many chunks in one frame into a single commit", () => {
    const commit = vi.fn();
    const batcher = createChunkBatcher(commit);

    // The whole point: 60 tokens in one frame must cost one render, not 60.
    for (const token of ["Hel", "lo", " ", "wor", "ld"]) batcher.push(token);

    runFrame();

    expect(commit).toHaveBeenCalledExactlyOnceWith("Hello world");
  });

  it("commits again on the next frame after new text arrives", () => {
    const commit = vi.fn();
    const batcher = createChunkBatcher(commit);

    batcher.push("one ");
    runFrame();
    batcher.push("two");
    runFrame();

    expect(commit.mock.calls).toEqual([["one "], ["two"]]);
  });

  it("ignores empty chunks rather than scheduling a wasted frame", () => {
    const commit = vi.fn();
    const batcher = createChunkBatcher(commit);

    batcher.push("");
    expect(queued).toHaveLength(0);

    runFrame();
    expect(commit).not.toHaveBeenCalled();
  });

  it("commits nothing on a frame with an empty buffer", () => {
    const commit = vi.fn();
    const batcher = createChunkBatcher(commit);

    batcher.push("a");
    runFrame();
    runFrame();

    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("flush commits pending text immediately", () => {
    const commit = vi.fn();
    const batcher = createChunkBatcher(commit);

    batcher.push("tail");
    batcher.flush();

    expect(commit).toHaveBeenCalledExactlyOnceWith("tail");
  });

  it("flush cancels the pending frame so text is not committed twice", () => {
    const commit = vi.fn();
    const batcher = createChunkBatcher(commit);

    batcher.push("once");
    batcher.flush();
    runFrame();

    expect(commit).toHaveBeenCalledExactlyOnceWith("once");
  });

  it("flush on an empty buffer is a no-op", () => {
    const commit = vi.fn();
    createChunkBatcher(commit).flush();
    expect(commit).not.toHaveBeenCalled();
  });

  it("keeps working after a flush", () => {
    const commit = vi.fn();
    const batcher = createChunkBatcher(commit);

    batcher.push("a");
    batcher.flush();
    batcher.push("b");
    runFrame();

    expect(commit.mock.calls).toEqual([["a"], ["b"]]);
  });
});
