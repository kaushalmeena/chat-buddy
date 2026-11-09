import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ChatProvider,
  DownloadProgress,
  ProviderAvailability,
} from "@/domain/provider.ts";

/*
 * Provider activation, through the store's interface, with the registry replaced
 * at its seam by a fake model whose availability and loading we control.
 */
const state = vi.hoisted(() => ({
  availability: { state: "downloaded" } as ProviderAvailability,
  progress: [] as DownloadProgress[],
  seen: [] as (DownloadProgress | undefined)[],
}));

vi.mock("@/db/conversations.ts", () => ({
  loadConversations: () => Promise.resolve([]),
  saveConversation: () => Promise.resolve(),
  deleteConversationRow: () => Promise.resolve(),
  pruneConversations: () => Promise.resolve(),
}));

vi.mock("@/engine/providers/registry.ts", () => {
  const model: ChatProvider = {
    id: "web-llm",
    label: "Model",
    description: "",
    isLocal: true,
    availability: () => Promise.resolve(state.availability),
    prepare: async (onProgress) => {
      for (const step of state.progress) onProgress?.(step);
      state.availability = { state: "ready" };
    },
    async *generate() {},
    dispose: () => Promise.resolve(),
  };
  const fallback: ChatProvider = { ...model, id: "rules", label: "Rules" };
  fallback.availability = () => Promise.resolve({ state: "ready" });

  return {
    FALLBACK_PROVIDER: fallback,
    LOCAL_PROVIDER: {
      ...model,
      selectModel: () => {},
      dispose: () => Promise.resolve(),
    },
    UNAVAILABLE_COPY: {},
    getProvider: (id: string) => (id === "web-llm" ? model : fallback),
    probeProviders: async () => [
      { provider: model, availability: await model.availability() },
      { provider: fallback, availability: { state: "ready" } },
    ],
    selectDefaultProvider: () => fallback,
  };
});

const { activateProvider, initialiseProviders, useChat } = await import("../chat.ts");
const { useConfig } = await import("../config.ts");

beforeEach(() => {
  state.availability = { state: "downloaded" };
  state.progress = [];
  state.seen = [];
  useChat.setState({
    activeProvider: undefined,
    downloadProgress: undefined,
    preparingId: undefined,
  });
  useConfig.setState({ preferredProviderId: undefined });
  useChat.subscribe((current) => state.seen.push(current.downloadProgress));
});

describe("model loading", () => {
  it("restores a chosen model whose weights are already on the device", async () => {
    useConfig.setState({ preferredProviderId: "web-llm" });

    await initialiseProviders();
    // Answers with the default straight away, then switches once loaded.
    expect(useChat.getState().activeProvider?.id).toBe("rules");
    await vi.waitFor(() =>
      expect(useChat.getState().activeProvider?.id).toBe("web-llm"),
    );
    expect(state.seen).toContainEqual({ label: "Loading model…" });
  });

  it("does not restore a model that would need a download", async () => {
    state.availability = { state: "needs-download", bytes: 1 };
    useConfig.setState({ preferredProviderId: "web-llm" });

    await initialiseProviders();

    expect(useChat.getState().activeProvider?.id).toBe("rules");
    expect(useChat.getState().downloadProgress).toBeUndefined();
  });

  it("shows 'Loading model…' once a download reaches 100%", async () => {
    state.availability = { state: "needs-download", bytes: 1 };
    state.progress = [
      { ratio: 0.4, label: "Fetching" },
      { ratio: 1, label: "Fetching" },
    ];

    await activateProvider("web-llm");

    expect(state.seen).toContainEqual({ ratio: 0.4, label: "Fetching" });
    expect(state.seen).not.toContainEqual({ ratio: 1, label: "Fetching" });
    expect(
      state.seen.filter((step) => step?.label === "Loading model…").length,
    ).toBeGreaterThan(1);
    expect(useChat.getState().downloadProgress).toBeUndefined();
  });

  it("names the engine being loaded while it loads, and clears it after", async () => {
    const preparing: (string | undefined)[] = [];
    const stop = useChat.subscribe((current) => preparing.push(current.preparingId));

    await activateProvider("web-llm");
    stop();

    expect(preparing).toContain("web-llm");
    expect(useChat.getState().preparingId).toBeUndefined();
  });
});
