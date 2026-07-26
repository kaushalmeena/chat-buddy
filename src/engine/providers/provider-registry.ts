import type { ReplySource } from "@/domain/message.ts";
import type { ChatProvider, ProviderAvailability } from "@/domain/provider.ts";
import { LocalRuleProvider } from "./local-rule-provider.ts";
import { PromptApiProvider } from "./prompt-api-provider.ts";
import { WebLlmProvider } from "./web-llm-provider.ts";

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
export const FALLBACK_PROVIDER: ChatProvider = new LocalRuleProvider();

export const PROVIDERS: readonly ChatProvider[] = [
  new PromptApiProvider(),
  new WebLlmProvider(),
  FALLBACK_PROVIDER,
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
  return ready?.provider ?? FALLBACK_PROVIDER;
}
