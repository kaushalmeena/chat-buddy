import type { ReplySource } from "@/domain/message.ts";
import type {
  ChatProvider,
  ProviderAvailability,
  UnavailableReason,
} from "@/domain/provider.ts";

import { PromptApiProvider } from "./chrome.ts";
import { LocalRuleProvider } from "./rules.ts";
import { WebLlmProvider } from "./webllm.ts";

/**
 * Providers in preference order: free and instant first, expensive-but-capable
 * second, always-works last.
 *
 * The rule provider is deliberately the floor rather than a fallback of last
 * resort — no in-browser language model has reach you can rely on, so something
 * has to answer on a phone, in Safari, and offline.
 */
/**
 * The baseline provider, held as a singleton so callers that need a guaranteed
 * answer share one instance instead of constructing throwaway ones.
 */
export const RULE_PROVIDER: ChatProvider = new LocalRuleProvider();

/** The WebLLM provider, exported typed so callers can choose which model it runs. */
export const WEBLLM_PROVIDER = new WebLlmProvider();

export const PROVIDERS: readonly ChatProvider[] = [
  new PromptApiProvider(),
  WEBLLM_PROVIDER,
  RULE_PROVIDER,
];

export type ProviderStatus = {
  readonly provider: ChatProvider;
  readonly availability: ProviderAvailability;
};

export function getProvider(id: ReplySource): ChatProvider {
  const provider = PROVIDERS.find((candidate) => candidate.id === id);
  if (!provider) throw new Error(`Unknown provider "${id}".`);
  return provider;
}

/** Probes every provider concurrently; probes are cheap and independent. */
export async function probeProviders(): Promise<readonly ProviderStatus[]> {
  return Promise.all(
    PROVIDERS.map(async (provider) => ({
      provider,
      availability: await provider.availability(),
    })),
  );
}

/**
 * Picks the provider to use on first load: the highest-preference one that needs
 * no download, which in practice means Chrome's built-in model where it exists
 * and the rule engine everywhere else.
 *
 * WebLLM is never auto-selected — a several-hundred-megabyte download is a
 * decision for the person, not a default.
 */
export function selectDefaultProvider(
  statuses: readonly ProviderStatus[],
): ChatProvider {
  const ready = statuses.find((status) => status.availability.state === "ready");
  return ready?.provider ?? RULE_PROVIDER;
}

/**
 * Why a provider cannot be used, worded once: `short` for the chip in the engine
 * list, `long` for the error shown after trying to switch. A `Record` rather than a
 * `switch`, so a new reason without copy is a type error, not a silent default.
 */
export const UNAVAILABLE_COPY: Record<
  UnavailableReason,
  { readonly short: string; readonly long: string }
> = {
  "no-webgpu": {
    short: "Needs WebGPU",
    long: "This browser has no WebGPU support, which the local model needs.",
  },
  "unsupported-browser": {
    short: "Needs Chrome 148+ on desktop",
    long: "This browser does not ship a built-in AI model.",
  },
  "insufficient-resources": {
    short: "Not enough free storage or memory",
    long: "This device does not have the free storage or memory the model needs.",
  },
  "module-missing": {
    short: "Unavailable on this device",
    long: "That model is not available on this device.",
  },
};
