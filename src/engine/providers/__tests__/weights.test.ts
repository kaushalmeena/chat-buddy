import { beforeEach, describe, expect, it } from "vitest";

import { findModel, modelUrl } from "../models.ts";
import {
  deleteWeights,
  downloadWeights,
  weightsOnDisk,
  type WeightsDeps,
} from "../weights.ts";

/** An in-memory Cache, enough of the interface for the downloader. */
class MemoryCache {
  readonly entries = new Map<string, Response>();

  match(request: RequestInfo | URL): Promise<Response | undefined> {
    return Promise.resolve(this.entries.get(urlOf(request))?.clone());
  }

  put(request: RequestInfo | URL, response: Response): Promise<void> {
    this.entries.set(urlOf(request), response);
    return Promise.resolve();
  }

  keys(): Promise<Request[]> {
    return Promise.resolve([...this.entries.keys()].map((url) => new Request(url)));
  }

  delete(request: RequestInfo | URL): Promise<boolean> {
    return Promise.resolve(this.entries.delete(urlOf(request)));
  }
}

function urlOf(request: RequestInfo | URL): string {
  return typeof request === "string"
    ? request
    : request instanceof URL
      ? request.href
      : request.url;
}

const model = findModel("SmolLM2-360M-Instruct-q4f16_1-MLC");
const base = modelUrl(model);
const SHARDS = [
  { dataPath: "params_shard_0.bin", nbytes: 6 },
  { dataPath: "params_shard_1.bin", nbytes: 4 },
  { dataPath: "params_shard_2.bin", nbytes: 5 },
];
const manifest = JSON.stringify({ records: SHARDS });

/** Shard contents: byte i of a shard is i, so a mis-joined resume is detectable. */
function shardBytes(nbytes: number): Uint8Array<ArrayBuffer> {
  return Uint8Array.from({ length: nbytes }, (_, index) => index);
}

/**
 * A fake network serving the manifest and shards, recording what was fetched.
 * Shards stream one byte per chunk so a download can be paused mid-shard, and
 * honour `Range` (206) unless `ignoreRange` is set (200, whole file).
 */
function network(options: { failOn?: string; ignoreRange?: boolean } = {}) {
  const fetched: string[] = [];
  const ranges: (string | null)[] = [];
  const fetchFn: typeof fetch = (input, init) => {
    const url = urlOf(input);
    fetched.push(url);
    init?.signal?.throwIfAborted();
    if (url.endsWith("tensor-cache.json"))
      return Promise.resolve(new Response(manifest));
    const shard = SHARDS.find((record) => url === new URL(record.dataPath, base).href);
    if (!shard || url.endsWith(options.failOn ?? "\0")) {
      return Promise.resolve(new Response(null, { status: 500 }));
    }
    const range = new Headers(init?.headers).get("Range");
    ranges.push(range);
    const start =
      range && !options.ignoreRange ? Number(/bytes=(\d+)-/.exec(range)?.[1]) : 0;
    const body = shardBytes(shard.nbytes).slice(start);
    // Pull-based and abort-aware, like a real fetch body: bytes arrive on demand,
    // and aborting the signal errors the stream mid-read.
    let index = 0;
    const signal = init?.signal;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (signal?.aborted) {
          controller.error(signal.reason);
          return;
        }
        const byte = body[index];
        index += 1;
        if (byte === undefined) controller.close();
        else controller.enqueue(Uint8Array.of(byte));
      },
    });
    return Promise.resolve(new Response(stream, { status: start > 0 ? 206 : 200 }));
  };
  return { fetched, fetchFn, ranges };
}

function setup(options: { failOn?: string; ignoreRange?: boolean } = {}) {
  const cache = new MemoryCache();
  const net = network(options);
  const deps: WeightsDeps = {
    openCache: () => Promise.resolve(cache as unknown as Cache),
    fetch: net.fetchFn,
  };
  return { cache, deps, fetched: net.fetched, ranges: net.ranges };
}

const TOTAL = SHARDS.reduce((sum, shard) => sum + shard.nbytes, 0);

describe("downloadWeights", () => {
  // Partial shards are kept in memory across calls (that is the resume); start
  // every test without any.
  beforeEach(async () => {
    await deleteWeights(model, setup().deps);
  });

  it("fetches every shard into WebLLM's cache keys and reports exact progress", async () => {
    const { cache, deps } = setup();
    const progress: number[] = [];

    await downloadWeights(
      model,
      {
        signal: new AbortController().signal,
        onProgress: (p) => progress.push(p.received),
      },
      deps,
    );

    expect(cache.entries.has(new URL("tensor-cache.json", base).href)).toBe(true);
    for (const shard of SHARDS) {
      expect(cache.entries.has(new URL(shard.dataPath, base).href)).toBe(true);
    }
    expect(progress.at(-1)).toBe(TOTAL);
    expect(await weightsOnDisk(model, deps)).toEqual({ received: TOTAL, total: TOTAL });
  });

  it("resumes: shards already on disk are not fetched again", async () => {
    const { cache, deps, fetched } = setup();
    await cache.put(new URL("tensor-cache.json", base).href, new Response(manifest));
    await cache.put(
      new URL(SHARDS[0]?.dataPath ?? "", base).href,
      new Response("cached"),
    );

    expect(await weightsOnDisk(model, deps)).toEqual({ received: 6, total: TOTAL });

    await downloadWeights(
      model,
      { signal: new AbortController().signal, onProgress: () => {} },
      deps,
    );

    expect(fetched).toEqual([
      new URL(SHARDS[1]?.dataPath ?? "", base).href,
      new URL(SHARDS[2]?.dataPath ?? "", base).href,
    ]);
  });

  it("stops when aborted, keeping finished shards for a later resume", async () => {
    const { deps } = setup();
    const controller = new AbortController();

    const run = downloadWeights(
      model,
      {
        signal: controller.signal,
        // Pause as soon as the first bytes arrive.
        onProgress: (p) => {
          if (p.received > 0) controller.abort("pause");
        },
      },
      deps,
    );

    await expect(run).rejects.toBe("pause");
    const onDisk = await weightsOnDisk(model, deps);
    expect(onDisk.received).toBeLessThan(TOTAL);
  });

  it("resumes a paused shard from its byte offset with a Range request", async () => {
    const { cache, deps, ranges } = setup();
    const controller = new AbortController();
    const firstShard = new URL(SHARDS[0]?.dataPath ?? "", base).href;
    const pauseEarly = (progress: { received: number }) => {
      if (progress.received >= 3) controller.abort("pause");
    };

    await expect(
      downloadWeights(
        model,
        { signal: controller.signal, onProgress: pauseEarly },
        deps,
      ),
    ).rejects.toBe("pause");
    await downloadWeights(
      model,
      { signal: new AbortController().signal, onProgress: () => {} },
      deps,
    );

    expect(ranges.some((range) => range?.startsWith("bytes=") ?? false)).toBe(true);
    const stored = await (await cache.match(firstShard))?.arrayBuffer();
    expect([...new Uint8Array(stored ?? new ArrayBuffer(0))]).toEqual([
      ...shardBytes(6),
    ]);
  });

  it("falls back to the whole file when a server ignores the range", async () => {
    const { cache, deps } = setup({ ignoreRange: true });
    const controller = new AbortController();
    const firstShard = new URL(SHARDS[0]?.dataPath ?? "", base).href;
    const pauseEarly = (progress: { received: number }) => {
      if (progress.received >= 3) controller.abort("pause");
    };

    await expect(
      downloadWeights(
        model,
        { signal: controller.signal, onProgress: pauseEarly },
        deps,
      ),
    ).rejects.toBe("pause");
    await downloadWeights(
      model,
      { signal: new AbortController().signal, onProgress: () => {} },
      deps,
    );

    const stored = await (await cache.match(firstShard))?.arrayBuffer();
    expect([...new Uint8Array(stored ?? new ArrayBuffer(0))]).toEqual([
      ...shardBytes(6),
    ]);
  });

  it("surfaces a failed shard as an error", async () => {
    const { deps } = setup({ failOn: "params_shard_1.bin" });
    await expect(
      downloadWeights(
        model,
        { signal: new AbortController().signal, onProgress: () => {} },
        deps,
      ),
    ).rejects.toThrow(/failed to download/);
  });
});

describe("deleteWeights", () => {
  it("removes only this model's files", async () => {
    const { cache, deps } = setup();
    await downloadWeights(
      model,
      { signal: new AbortController().signal, onProgress: () => {} },
      deps,
    );
    const other =
      "https://huggingface.co/mlc-ai/Other-Model/resolve/main/params_shard_0.bin";
    await cache.put(other, new Response("x"));

    await deleteWeights(model, deps);

    expect([...cache.entries.keys()]).toEqual([other]);
    expect(await weightsOnDisk(model, deps)).toEqual({
      received: 0,
      total: model.bytes,
    });
  });
});
