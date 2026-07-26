import { describe, expect, it, vi } from "vitest";
import type { Message } from "@/domain/message.ts";
import type { ChatProvider, GenerateOptions } from "@/domain/provider.ts";
import { ProviderError } from "@/domain/provider.ts";
import { ChatEngine, type TurnObserver } from "../chat-engine.ts";

function observer() {
  const chunks: string[] = [];
  const calls = { complete: 0, stopped: 0 };
  let error: string | undefined;

  const spy: TurnObserver = {
    onChunk: (chunk) => chunks.push(chunk),
    onComplete: () => {
      calls.complete += 1;
    },
    onStopped: () => {
      calls.stopped += 1;
    },
    onError: (message) => {
      error = message;
    },
  };

  return {
    spy,
    get text() {
      return chunks.join("");
    },
    get chunks() {
      return chunks;
    },
    get calls() {
      return calls;
    },
    get error() {
      return error;
    },
  };
}

/** Minimal provider whose generation behaviour each test supplies. */
function stubProvider(
  generate: (options: GenerateOptions) => AsyncIterable<string>,
): ChatProvider {
  return {
    id: "rules",
    label: "stub",
    description: "stub",
    isLocal: true,
    availability: () => Promise.resolve({ state: "ready" as const }),
    prepare: () => Promise.resolve(),
    generate,
    dispose: () => Promise.resolve(),
  };
}

const HISTORY: readonly Message[] = [
  { id: "u1", role: "user", text: "hi", createdAt: 0 },
];

describe("ChatEngine", () => {
  it("streams chunks and reports completion", async () => {
    const engine = new ChatEngine();
    const spy = observer();

    const provider = stubProvider(async function* () {
      yield "Hel";
      yield "lo";
    });

    await engine.run(provider, HISTORY, spy.spy);

    expect(spy.text).toBe("Hello");
    expect(spy.chunks).toEqual(["Hel", "lo"]);
    expect(spy.calls.complete).toBe(1);
    expect(spy.calls.stopped).toBe(0);
    expect(engine.isGenerating).toBe(false);
  });

  it("reports a provider failure as an error, not a stop", async () => {
    const engine = new ChatEngine();
    const spy = observer();

    const provider = stubProvider(async function* () {
      yield "partial";
      throw new ProviderError("rules", "model exploded");
    });

    await engine.run(provider, HISTORY, spy.spy);

    expect(spy.text).toBe("partial");
    expect(spy.error).toBe("model exploded");
    expect(spy.calls.complete).toBe(0);
  });

  it("treats a user stop as stopped, keeping the partial text", async () => {
    const engine = new ChatEngine();
    const spy = observer();

    const provider = stubProvider(async function* ({ signal }) {
      yield "kept";
      engine.stop();
      signal.throwIfAborted();
      yield "never";
    });

    await engine.run(provider, HISTORY, spy.spy);

    expect(spy.text).toBe("kept");
    expect(spy.calls.stopped).toBe(1);
    expect(spy.error).toBeUndefined();
  });

  it("reports a timeout as an error even though it arrives as an abort", async () => {
    vi.useFakeTimers();

    try {
      const engine = new ChatEngine();
      const spy = observer();

      const provider = stubProvider(async function* ({ signal }) {
        yield "slow";
        // Let the 120s guard fire while the provider is still yielding.
        await vi.advanceTimersByTimeAsync(130_000);
        signal.throwIfAborted();
        yield "unreachable";
      });

      await engine.run(provider, HISTORY, spy.spy);

      expect(spy.error).toBe("The model took too long to respond.");
      expect(spy.calls.stopped).toBe(0);
      expect(spy.calls.complete).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a provider that returns cleanly on abort as stopped", async () => {
    const engine = new ChatEngine();
    const spy = observer();

    // Some providers swallow the abort and simply stop yielding.
    const provider = stubProvider(async function* () {
      yield "done";
      engine.stop();
    });

    await engine.run(provider, HISTORY, spy.spy);

    expect(spy.calls.stopped).toBe(1);
    expect(spy.calls.complete).toBe(0);
  });

  it("supersedes an in-flight turn when a new one starts", async () => {
    const engine = new ChatEngine();
    const first = observer();
    const second = observer();

    const provider = stubProvider(async function* ({ signal }) {
      for (const chunk of ["a", "b", "c"]) {
        signal.throwIfAborted();
        yield chunk;
        await Promise.resolve();
      }
    });

    const running = engine.run(provider, HISTORY, first.spy);
    await engine.run(provider, HISTORY, second.spy);
    await running;

    expect(second.calls.complete).toBe(1);
    expect(engine.isGenerating).toBe(false);
  });

  it("is idle after a turn, so stop() on an idle engine is harmless", async () => {
    const engine = new ChatEngine();
    const spy = observer();

    await engine.run(
      stubProvider(async function* () {
        yield "x";
      }),
      HISTORY,
      spy.spy,
    );

    expect(() => engine.stop()).not.toThrow();
    expect(engine.isGenerating).toBe(false);
  });
});
