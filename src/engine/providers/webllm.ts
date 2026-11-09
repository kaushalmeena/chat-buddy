import {
  type ChatProvider,
  type DownloadProgress,
  type GenerateOptions,
  type ProviderAvailability,
  ProviderError,
} from "@/domain/provider.ts";

import { findModel, type LocalModel } from "./models.ts";
import { HISTORY_TURN_LIMIT, SYSTEM_PROMPT } from "./prompt.ts";
import { weightsOnDisk } from "./weights.ts";

/**
 * WebLLM: a full open-weights model compiled to WebGPU, running in a worker.
 *
 * The most capable provider and the most expensive one — the weights are a
 * multi-hundred-megabyte download, so it is never prepared without an explicit
 * opt-in. Which model it runs is chosen from `LOCAL_MODELS`; downloading is done
 * by `weights.ts` (pausable, resumable), so by the time this provider loads a
 * model its weights are already cached and WebLLM only reads them. The
 * `@mlc-ai/web-llm` import is dynamic and code-split into its own chunk, so
 * visitors who never enable it pay nothing for it.
 *
 * @see https://webllm.mlc.ai/
 */
export class WebLlmProvider implements ChatProvider {
  readonly id = "web-llm" as const;
  readonly isLocal = true;

  #model: LocalModel = findModel(undefined);
  #engine: WebLlmEngine | undefined;
  /** The model the loaded engine holds, which may lag a just-changed selection. */
  #engineModelId: string | undefined;
  /** In-flight `prepare` call, so concurrent callers share one download. */
  #preparing: Promise<void> | undefined;

  get label(): string {
    return `Local · ${this.#model.label}`;
  }

  get description(): string {
    return `${this.#model.note} Runs on your GPU, then works offline.`;
  }

  get model(): LocalModel {
    return this.#model;
  }

  /** Chooses which model to run. Takes effect on the next `prepare`. */
  selectModel(id: string): void {
    this.#model = findModel(id);
  }

  async availability(): Promise<ProviderAvailability> {
    if (!hasWebGpu(navigator)) {
      return { state: "unavailable", reason: "no-webgpu" };
    }

    // A GPU adapter is the real gate: WebGPU can be present but refuse to
    // hand out an adapter on a blocklisted or software-only driver.
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return { state: "unavailable", reason: "no-webgpu" };
    } catch {
      return { state: "unavailable", reason: "no-webgpu" };
    }

    if (this.#engine && this.#engineModelId === this.#model.id)
      return { state: "ready" };

    const onDisk = await weightsOnDisk(this.#model);
    if (onDisk.received > 0 && onDisk.received === onDisk.total) {
      return { state: "downloaded" };
    }
    return { state: "needs-download", bytes: onDisk.total - onDisk.received };
  }

  prepare(onProgress?: (progress: DownloadProgress) => void): Promise<void> {
    if (this.#engine && this.#engineModelId === this.#model.id)
      return Promise.resolve();
    this.#preparing ??= this.#load(onProgress).finally(() => {
      this.#preparing = undefined;
    });
    return this.#preparing;
  }

  async #load(onProgress?: (progress: DownloadProgress) => void): Promise<void> {
    let webllm: typeof import("@mlc-ai/web-llm");

    try {
      // Split into its own chunk by `manualChunks` in vite.config.ts.
      webllm = await import("@mlc-ai/web-llm");
    } catch (cause) {
      throw new ProviderError(this.id, "The local model engine failed to load.", {
        cause,
      });
    }

    // One model on the GPU at a time: free the previous one before loading.
    if (this.#engine) {
      await this.#engine.unload();
      this.#engine = undefined;
      this.#engineModelId = undefined;
    }

    const model = this.#model;
    try {
      this.#engine = await webllm.CreateMLCEngine(model.id, {
        initProgressCallback(report) {
          onProgress?.({
            ratio: report.progress,
            label: report.text || "Preparing local model",
          });
        },
      });
      this.#engineModelId = model.id;
    } catch (cause) {
      throw new ProviderError(this.id, "The local model failed to initialise.", {
        cause,
      });
    }
  }

  async *generate({ turns, signal }: GenerateOptions): AsyncIterable<string> {
    await this.prepare();

    const engine = this.#engine;
    if (!engine) {
      throw new ProviderError(this.id, "The local model is not ready.");
    }

    const history =
      turns.length <= HISTORY_TURN_LIMIT ? turns : turns.slice(-HISTORY_TURN_LIMIT);

    // WebLLM has no per-request abort signal, so cancellation is cooperative:
    // stop consuming and tell the engine to abandon the request.
    const onAbort = () => void engine.interruptGenerate();
    signal.addEventListener("abort", onAbort, { once: true });

    try {
      const stream = await engine.chat.completions.create({
        stream: true,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...history.map((turn) => ({ role: turn.role, content: turn.content })),
        ],
      });

      for await (const packet of stream) {
        signal.throwIfAborted();
        const chunk = packet.choices[0]?.delta?.content;
        if (chunk) yield chunk;
      }
    } catch (cause) {
      if (signal.aborted) throw cause;
      throw new ProviderError(this.id, "The local model failed to reply.", { cause });
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  }

  async dispose(): Promise<void> {
    await this.#engine?.unload();
    this.#engine = undefined;
    this.#engineModelId = undefined;
  }
}

/** The slice of the WebLLM engine this provider depends on. */
type WebLlmEngine = Awaited<
  ReturnType<typeof import("@mlc-ai/web-llm").CreateMLCEngine>
>;

/** Narrows `navigator` to one that exposes WebGPU, without asserting. */
function hasWebGpu(value: Navigator): value is Navigator & { gpu: GPU } {
  return "gpu" in value && value.gpu !== undefined;
}
