import { type LocalModel, modelUrl } from "./models.ts";

/**
 * Downloads a model's weights into the exact Cache Storage entries WebLLM reads.
 *
 * WebLLM fetches a `tensor-cache.json` manifest and then each weight shard, storing
 * every file in the `webllm/model` cache keyed by its URL — and on load, skips any
 * file already there. Doing that fetching here instead gives what WebLLM's own
 * loader cannot: pause (abort, keeping finished shards), resume (skip them), stop
 * (abort and delete), and exact byte-level progress from the manifest's sizes.
 * When the download completes, WebLLM finds everything cached and only loads.
 */

/** WebLLM's Cache Storage bucket for model weights. */
export const WEIGHTS_CACHE = "webllm/model";

/** Shards fetched at once: enough to fill a fast connection without flooding it. */
const CONCURRENCY = 3;

type ShardRecord = { readonly dataPath: string; readonly nbytes: number };

type Manifest = { readonly records: readonly ShardRecord[] };

export type WeightsProgress = {
  /** Bytes on disk so far, including shards from an earlier, paused download. */
  readonly received: number;
  readonly total: number;
};

/** The pieces this module needs from the platform, injectable for tests. */
export type WeightsDeps = {
  readonly openCache: () => Promise<Cache>;
  readonly fetch: typeof fetch;
};

const browserDeps: WeightsDeps = {
  openCache: () => caches.open(WEIGHTS_CACHE),
  fetch: (...args) => fetch(...args),
};

function isManifest(value: unknown): value is Manifest {
  return (
    typeof value === "object" &&
    value !== null &&
    "records" in value &&
    Array.isArray(value.records) &&
    value.records.every(
      (record: unknown) =>
        typeof record === "object" &&
        record !== null &&
        "dataPath" in record &&
        typeof record.dataPath === "string" &&
        "nbytes" in record &&
        typeof record.nbytes === "number",
    )
  );
}

/**
 * Partly fetched shards from a paused download, by URL. Kept in memory only: a
 * pause within the session loses nothing, while a reload falls back to whole
 * shards (finished ones are in Cache Storage either way).
 */
const partials = new Map<string, Uint8Array<ArrayBuffer>[]>();

function partialBytes(url: string): number {
  return (partials.get(url) ?? []).reduce((sum, chunk) => sum + chunk.byteLength, 0);
}

/** Joins a shard's chunks and stores it under the URL WebLLM will look up. */
function storeShard(
  cache: Cache,
  url: string,
  chunks: readonly Uint8Array<ArrayBuffer>[],
): Promise<void> {
  const bytes = new Uint8Array(
    chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return cache.put(
    url,
    new Response(bytes, { headers: { "Content-Type": "application/octet-stream" } }),
  );
}

function manifestUrl(model: LocalModel): string {
  return new URL("tensor-cache.json", modelUrl(model)).href;
}

function shardUrl(model: LocalModel, record: ShardRecord): string {
  return new URL(record.dataPath, modelUrl(model)).href;
}

/** The manifest from cache only — never the network — or undefined. */
async function cachedManifest(
  cache: Cache,
  model: LocalModel,
): Promise<Manifest | undefined> {
  const response = await cache.match(manifestUrl(model));
  if (!response) return undefined;
  const value: unknown = await response.json();
  return isManifest(value) ? value : undefined;
}

/**
 * How much of a model is on the device, read from Cache Storage without touching
 * the network. `received === total` means it is complete.
 */
export async function weightsOnDisk(
  model: LocalModel,
  deps: WeightsDeps = browserDeps,
): Promise<WeightsProgress> {
  try {
    const cache = await deps.openCache();
    const manifest = await cachedManifest(cache, model);
    if (!manifest) return { received: 0, total: model.bytes };

    const keys = new Set((await cache.keys()).map((request) => request.url));
    const total = manifest.records.reduce((sum, record) => sum + record.nbytes, 0);
    const received = manifest.records
      .filter((record) => keys.has(shardUrl(model, record)))
      .reduce((sum, record) => sum + record.nbytes, 0);
    return { received, total };
  } catch {
    return { received: 0, total: model.bytes };
  }
}

/**
 * Downloads every missing shard, reporting progress as bytes arrive. Rejects with
 * the signal's reason when aborted; shards already finished stay cached, so a
 * later call resumes where this one stopped.
 */
export async function downloadWeights(
  model: LocalModel,
  options: {
    readonly signal: AbortSignal;
    readonly onProgress: (progress: WeightsProgress) => void;
  },
  deps: WeightsDeps = browserDeps,
): Promise<void> {
  const { signal, onProgress } = options;
  const cache = await deps.openCache();

  let manifest = await cachedManifest(cache, model);
  if (!manifest) {
    const response = await deps.fetch(manifestUrl(model), { signal });
    if (!response.ok)
      throw new Error(`Couldn't fetch the model manifest (${response.status}).`);
    const value: unknown = await response.clone().json();
    if (!isManifest(value))
      throw new Error("The model manifest is not in the expected format.");
    await cache.put(manifestUrl(model), response);
    manifest = value;
  }

  const keys = new Set((await cache.keys()).map((request) => request.url));
  const total = manifest.records.reduce((sum, record) => sum + record.nbytes, 0);
  const pending = manifest.records.filter(
    (record) => !keys.has(shardUrl(model, record)),
  );
  // On disk, plus any partial shards kept in memory from a pause.
  let received =
    total -
    pending.reduce((sum, record) => sum + record.nbytes, 0) +
    pending.reduce((sum, record) => sum + partialBytes(shardUrl(model, record)), 0);

  onProgress({ received, total });

  const fetchShard = async (record: ShardRecord) => {
    const url = shardUrl(model, record);

    // Bytes kept from a paused attempt: ask only for the rest.
    const kept = partials.get(url) ?? [];
    const keptBytes = kept.reduce((sum, chunk) => sum + chunk.byteLength, 0);

    // Every byte already arrived before the pause: store it, no request needed
    // (a range starting at the end would be refused by the server).
    if (keptBytes >= record.nbytes) {
      received += record.nbytes - keptBytes;
      await storeShard(cache, url, kept);
      partials.delete(url);
      onProgress({ received, total });
      return;
    }
    const response = await deps.fetch(url, {
      signal,
      ...(keptBytes > 0 ? { headers: { Range: `bytes=${keptBytes}-` } } : {}),
    });
    if (!response.ok || !response.body) {
      throw new Error(`A model file failed to download (${response.status}).`);
    }

    // 206 continues from where we stopped; a plain 200 means the server ignored
    // the range, so the kept bytes are dropped rather than duplicated.
    const chunks = response.status === 206 ? kept : [];
    if (response.status !== 206 && keptBytes > 0) {
      received -= keptBytes;
      onProgress({ received, total });
    }
    let shardBytes = response.status === 206 ? keptBytes : 0;

    // Stream it, so progress moves within a shard rather than in 30 MB jumps.
    const reader = response.body.getReader();
    try {
      for (;;) {
        // oxlint-disable-next-line no-await-in-loop -- a stream is read in order
        const { done, value } = await reader.read();
        if (done) break;
        // `slice` gives a plain ArrayBuffer-backed copy of the chunk.
        chunks.push(value.slice());
        shardBytes += value.byteLength;
        received += value.byteLength;
        onProgress({ received, total });
      }
    } catch (error) {
      // Paused or failed mid-shard: keep what arrived, for a ranged resume.
      partials.set(url, chunks);
      throw error;
    }

    // Paused right after the last byte: keep the whole shard for the resume.
    if (signal.aborted) {
      partials.set(url, chunks);
      signal.throwIfAborted();
    }
    // Count the manifest's size, not the bytes seen, so totals always reconcile.
    received += record.nbytes - shardBytes;
    await storeShard(cache, url, chunks);
    partials.delete(url);
    onProgress({ received, total });
  };

  // A small pool: CONCURRENCY workers draining the queue in order.
  const queue = [...pending];
  const worker = async () => {
    for (let record = queue.shift(); record; record = queue.shift()) {
      signal.throwIfAborted();
      // oxlint-disable-next-line no-await-in-loop -- each worker is sequential by design
      await fetchShard(record);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

/** Deletes a model's weights (and manifest) from the device. */
export async function deleteWeights(
  model: LocalModel,
  deps: WeightsDeps = browserDeps,
): Promise<void> {
  const cache = await deps.openCache();
  const prefix = modelUrl(model);
  for (const url of partials.keys()) if (url.startsWith(prefix)) partials.delete(url);
  const requests = await cache.keys();
  await Promise.all(
    requests
      .filter((request) => request.url.startsWith(prefix))
      .map((request) => cache.delete(request)),
  );
}
