import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The download store through its interface, with the weights module replaced at
 * its seam by a controllable fake: each download waits until the test resolves
 * it, or rejects with the abort reason when paused or stopped.
 */
const fake = vi.hoisted(() => ({
  onDisk: new Map<string, { received: number; total: number }>(),
  deleted: [] as string[],
  finish: undefined as (() => void) | undefined,
  switched: [] as string[],
  /** The card's model id, seen while the switch to the new model runs. */
  activeDuringSwitch: [] as (string | undefined)[],
}));

vi.mock("@/engine/providers/weights.ts", () => ({
  weightsOnDisk: (model: { id: string; bytes: number }) =>
    Promise.resolve(fake.onDisk.get(model.id) ?? { received: 0, total: model.bytes }),
  deleteWeights: (model: { id: string }) => {
    fake.deleted.push(model.id);
    fake.onDisk.delete(model.id);
    return Promise.resolve();
  },
  downloadWeights: (
    model: { id: string; bytes: number },
    options: {
      signal: AbortSignal;
      onProgress: (p: { received: number; total: number }) => void;
    },
  ) =>
    new Promise<void>((resolve, reject) => {
      options.onProgress({ received: 10, total: model.bytes });
      options.signal.addEventListener("abort", () => reject(options.signal.reason));
      fake.finish = () => {
        fake.onDisk.set(model.id, { received: model.bytes, total: model.bytes });
        resolve();
      };
    }),
}));

vi.mock("@/stores/chat.ts", () => ({
  activateProvider: async (id: string) => {
    const { useDownloads } = await import("../downloads.ts");
    fake.activeDuringSwitch.push(useDownloads.getState().activeId);
    fake.switched.push(id);
  },
  refreshProviders: () => Promise.resolve(),
  releaseLocalModel: () => Promise.resolve(),
  useChat: { getState: () => ({ activeProvider: undefined }) },
}));

const {
  cancelDownload,
  chooseLocalModel,
  downloadOf,
  pauseDownload,
  scanDownloads,
  useDownloads,
} = await import("../downloads.ts");
const { useConfig } = await import("../config.ts");

const SMALL = "SmolLM2-360M-Instruct-q4f16_1-MLC";
const OTHER = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  fake.onDisk.clear();
  fake.deleted = [];
  fake.switched = [];
  fake.activeDuringSwitch = [];
  fake.finish = undefined;
  useDownloads.setState({ models: {}, activeId: undefined, useWhenDoneId: undefined });
});

describe("downloads", () => {
  it("downloads a chosen model, then switches to it", async () => {
    const run = chooseLocalModel(SMALL);
    await settle();
    expect(downloadOf(SMALL).status).toBe("downloading");
    expect(useDownloads.getState().activeId).toBe(SMALL);

    fake.finish?.();
    await run;

    expect(downloadOf(SMALL).status).toBe("complete");
    expect(useDownloads.getState().activeId).toBeUndefined();
    expect(useConfig.getState().localModelId).toBe(SMALL);
    expect(fake.switched).toEqual(["web-llm"]);
  });

  it("keeps the card up while switching, so loading follows the download without a blink", async () => {
    const run = chooseLocalModel(SMALL);
    await settle();
    fake.finish?.();
    await run;

    expect(fake.activeDuringSwitch).toEqual([SMALL]);
    expect(useDownloads.getState().activeId).toBeUndefined();
  });

  it("clears the card after a download nobody is waiting to use", async () => {
    const run = chooseLocalModel(SMALL);
    await settle();
    useDownloads.setState({ useWhenDoneId: undefined });
    fake.finish?.();
    await run;

    expect(fake.switched).toEqual([]);
    expect(useDownloads.getState().activeId).toBeUndefined();
  });

  it("pauses, keeping the bytes, and resumes", async () => {
    const run = chooseLocalModel(SMALL);
    await settle();

    pauseDownload(SMALL);
    await run;

    expect(downloadOf(SMALL)).toMatchObject({ status: "paused", received: 10 });
    expect(fake.deleted).toEqual([]);
  });

  it("stops, deleting what was fetched, and does not switch", async () => {
    const run = chooseLocalModel(SMALL);
    await settle();

    await cancelDownload(SMALL);
    await run;

    expect(downloadOf(SMALL)).toMatchObject({ status: "idle", received: 0 });
    expect(fake.deleted).toEqual([SMALL]);
    expect(fake.switched).toEqual([]);
  });

  it("pauses the current download when another starts", async () => {
    const first = chooseLocalModel(SMALL);
    await settle();
    void chooseLocalModel(OTHER);
    await first;

    expect(downloadOf(SMALL).status).toBe("paused");
    expect(useDownloads.getState().activeId).toBe(OTHER);
  });

  it("rebuilds state from the device: complete, paused, and the paused one shown", async () => {
    fake.onDisk.set(SMALL, { received: 100, total: 100 });
    fake.onDisk.set(OTHER, { received: 40, total: 100 });

    await scanDownloads();

    expect(downloadOf(SMALL).status).toBe("complete");
    expect(downloadOf(OTHER)).toMatchObject({ status: "paused", received: 40 });
    expect(useDownloads.getState().activeId).toBe(OTHER);
  });
});
