import { create } from "zustand";

import { findModel, LOCAL_MODELS } from "@/engine/providers/models.ts";
import { LOCAL_PROVIDER } from "@/engine/providers/registry.ts";
import {
  deleteWeights,
  downloadWeights,
  weightsOnDisk,
} from "@/engine/providers/weights.ts";

import {
  activateProvider,
  refreshProviders,
  releaseLocalModel,
  useChat,
} from "./chat.ts";
import { useConfig } from "./config.ts";

export type DownloadStatus = "idle" | "downloading" | "paused" | "complete" | "failed";

export type ModelDownload = {
  readonly status: DownloadStatus;
  /** Bytes on the device, including shards from before a pause. */
  readonly received: number;
  readonly total: number;
  /** Smoothed bytes per second while downloading; cleared when it stops. */
  readonly speed: number | undefined;
  /** Why the last attempt failed, until the next one. */
  readonly error: string | undefined;
};

type DownloadsState = {
  readonly models: Readonly<Record<string, ModelDownload>>;
  /** The model currently downloading or paused mid-download, shown top-left. */
  readonly activeId: string | undefined;
  /** Switch to this model as soon as its download completes. */
  readonly useWhenDoneId: string | undefined;
};

/**
 * Local-model downloads: one at a time, pausable, resumable, cancellable.
 *
 * The bytes live in Cache Storage (see `weights.ts`); this store only tracks
 * what the interface shows, and is rebuilt from the cache on startup by
 * `scanDownloads`, so a download paused yesterday shows as paused today.
 */
export const useDownloads = create<DownloadsState>(() => ({
  models: {},
  activeId: undefined,
  useWhenDoneId: undefined,
}));

const { setState, getState } = useDownloads;

/** Abort reasons, so the catch knows whether to keep or delete the bytes. */
const PAUSE = "pause";
const STOP = "stop";

/** How often progress is written to the store; finer than this is invisible. */
const PROGRESS_INTERVAL_MS = 250;

let controller: AbortController | undefined;

export function downloadOf(id: string): ModelDownload {
  return (
    getState().models[id] ?? {
      status: "idle",
      received: 0,
      total: findModel(id).bytes,
      speed: undefined,
      error: undefined,
    }
  );
}

function patch(id: string, update: Partial<ModelDownload>): void {
  setState((state) => ({
    models: { ...state.models, [id]: { ...downloadOf(id), ...update } },
  }));
}

/** Rebuilds download state from what is actually in Cache Storage. */
export async function scanDownloads(): Promise<void> {
  const found = await Promise.all(
    LOCAL_MODELS.map(async (model) => [model.id, await weightsOnDisk(model)] as const),
  );

  const models: Record<string, ModelDownload> = {};
  let paused: string | undefined;
  for (const [id, { received, total }] of found) {
    const status: DownloadStatus =
      received === 0 ? "idle" : received === total ? "complete" : "paused";
    models[id] = { status, received, total, speed: undefined, error: undefined };
    if (status === "paused") paused ??= id;
  }

  setState((state) => ({
    models: { ...models, ...pickLive(state.models) },
    activeId: state.activeId ?? paused,
  }));
}

/** Keeps any in-flight entry, which the scan would otherwise overwrite. */
function pickLive(
  models: Readonly<Record<string, ModelDownload>>,
): Record<string, ModelDownload> {
  return Object.fromEntries(
    Object.entries(models).filter(([, download]) => download.status === "downloading"),
  );
}

/**
 * The one entry point for choosing a local model: switch to it if it is on the
 * device, otherwise start (or resume) its download and switch when it finishes.
 */
export async function chooseLocalModel(id: string): Promise<void> {
  if (downloadOf(id).status === "complete") {
    await switchTo(id);
    return;
  }
  setState({ useWhenDoneId: id });
  await startDownload(id);
}

async function switchTo(id: string): Promise<void> {
  useConfig.getState().setLocalModel(id);
  LOCAL_PROVIDER.selectModel(id);
  await activateProvider("web-llm");
}

/** Starts or resumes a download. Any other download in progress is paused first. */
export async function startDownload(id: string): Promise<void> {
  const current = getState().activeId;
  if (current && current !== id && downloadOf(current).status === "downloading") {
    pauseDownload(current);
  }

  const model = findModel(id);
  const ownController = new AbortController();
  controller = ownController;
  setState({ activeId: id });
  patch(id, { status: "downloading", error: undefined, speed: undefined });

  let lastWrite = 0;
  let lastBytes = downloadOf(id).received;
  let speed: number | undefined;

  try {
    await downloadWeights(model, {
      signal: ownController.signal,
      onProgress: ({ received, total }) => {
        const now = performance.now();
        if (now - lastWrite < PROGRESS_INTERVAL_MS && received < total) return;
        if (lastWrite > 0) {
          const instant = ((received - lastBytes) * 1000) / (now - lastWrite);
          // Exponentially smoothed, so the readout does not jitter.
          speed = speed === undefined ? instant : speed * 0.8 + instant * 0.2;
        }
        lastWrite = now;
        lastBytes = received;
        patch(id, { received, total, speed });
      },
    });

    patch(id, { status: "complete", received: downloadOf(id).total });
    // When the model is about to be switched to, the card stays up through the
    // switch: it moves from "downloading" straight to "loading onto the GPU"
    // instead of vanishing and reappearing a moment later.
    const willSwitch = getState().useWhenDoneId === id;
    if (willSwitch) setState({ useWhenDoneId: undefined });
    try {
      await refreshProviders();
      if (willSwitch) await switchTo(id);
    } finally {
      setState((state) => ({
        activeId: state.activeId === id ? undefined : state.activeId,
      }));
    }
  } catch (error) {
    const reason: unknown = ownController.signal.reason;
    if (reason === PAUSE) {
      patch(id, { status: "paused", speed: undefined });
    } else if (reason === STOP) {
      await deleteWeights(model);
      patch(id, { status: "idle", received: 0, speed: undefined });
    } else {
      patch(id, {
        status: "failed",
        speed: undefined,
        error: error instanceof Error ? error.message : "The download failed.",
      });
    }
  } finally {
    if (controller === ownController) controller = undefined;
  }
}

export function pauseDownload(id: string): void {
  if (getState().activeId === id) controller?.abort(PAUSE);
}

export function resumeDownload(id: string): void {
  void startDownload(id);
}

/** Stops a download and deletes what it fetched. */
export async function cancelDownload(id: string): Promise<void> {
  setState((state) => ({
    useWhenDoneId: state.useWhenDoneId === id ? undefined : state.useWhenDoneId,
  }));

  if (downloadOf(id).status === "downloading") {
    controller?.abort(STOP);
  } else {
    await deleteWeights(findModel(id));
    patch(id, { status: "idle", received: 0, speed: undefined, error: undefined });
  }
  setState((state) => ({
    activeId: state.activeId === id ? undefined : state.activeId,
  }));
}

/** Deletes a downloaded model, stepping off it first if it is in use. */
export async function deleteModel(id: string): Promise<void> {
  const isInUse =
    useConfig.getState().localModelId === id &&
    useChat.getState().activeProvider?.id === "web-llm";
  if (isInUse) await releaseLocalModel();

  await deleteWeights(findModel(id));
  patch(id, { status: "idle", received: 0 });
  await refreshProviders();
}
