/**
 * The local models a person can download and run with WebLLM.
 *
 * `bytes` is the exact weight download, summed from each model's
 * `tensor-cache.json` manifest on Hugging Face; `gpuMB` is WebLLM's own figure for
 * the GPU memory it needs. Both are stated up front, because finding out after a
 * 2 GB download that a model does not fit is the wrong time.
 */
export type LocalModel = {
  /** WebLLM's prebuilt model id. */
  readonly id: string;
  readonly label: string;
  /** One line: what it is good for. */
  readonly note: string;
  readonly bytes: number;
  readonly gpuMB: number;
};

export const LOCAL_MODELS: readonly LocalModel[] = [
  {
    id: "SmolLM2-360M-Instruct-q4f16_1-MLC",
    label: "SmolLM2 360M",
    note: "Tiny and quick. Simple chat on almost any GPU.",
    bytes: 203_614_080,
    gpuMB: 376,
  },
  {
    id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    label: "Qwen2.5 0.5B",
    note: "Small, fast, surprisingly capable.",
    bytes: 277_996_288,
    gpuMB: 945,
  },
  {
    id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    label: "Llama 3.2 1B",
    note: "A good balance of speed and quality.",
    bytes: 695_242_752,
    gpuMB: 879,
  },
  {
    id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    label: "Qwen2.5 1.5B",
    note: "Stronger reasoning, still light.",
    bytes: 868_547_584,
    gpuMB: 1630,
  },
  {
    id: "gemma-2-2b-it-q4f16_1-MLC",
    label: "Gemma 2 2B",
    note: "Fluent writing. Needs a capable GPU.",
    bytes: 1_470_915_072,
    gpuMB: 1895,
  },
  {
    id: "Llama-3.2-3B-Instruct-q4f16_1-MLC",
    label: "Llama 3.2 3B",
    note: "Noticeably smarter; slower to load.",
    bytes: 1_807_423_488,
    gpuMB: 2264,
  },
  {
    id: "Phi-3.5-mini-instruct-q4f16_1-MLC",
    label: "Phi-3.5 mini",
    note: "The most capable here. Needs a strong GPU.",
    bytes: 2_149_644_288,
    gpuMB: 3672,
  },
];

export const DEFAULT_MODEL_ID = "Llama-3.2-1B-Instruct-q4f16_1-MLC";

function defaultModel(): LocalModel {
  const model = LOCAL_MODELS.find((candidate) => candidate.id === DEFAULT_MODEL_ID);
  if (!model)
    throw new Error(`DEFAULT_MODEL_ID "${DEFAULT_MODEL_ID}" is not in LOCAL_MODELS.`);
  return model;
}

const DEFAULT_MODEL = defaultModel();

/** The model with this id, or the default for an unknown or missing one. */
export function findModel(id: string | undefined): LocalModel {
  return LOCAL_MODELS.find((model) => model.id === id) ?? DEFAULT_MODEL;
}

/** Where WebLLM fetches a model's files from, and the key prefix it caches them under. */
export function modelUrl(model: LocalModel): string {
  return `https://huggingface.co/mlc-ai/${model.id}/resolve/main/`;
}

/** Renders bytes as a rounded figure for display. */
export function formatBytes(bytes: number): string {
  const megabytes = bytes / 1024 / 1024;
  if (megabytes >= 1024) return `${(megabytes / 1024).toFixed(1)} GB`;
  return `${Math.round(megabytes)} MB`;
}
