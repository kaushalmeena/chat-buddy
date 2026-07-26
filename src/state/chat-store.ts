import { create } from "zustand";
import {
  type Conversation,
  deriveTitle,
  NEW_CONVERSATION_TITLE,
} from "@/domain/conversation.ts";
import type { AssistantMessage, Message, ReplySource } from "@/domain/message.ts";
import type { ChatProvider, DownloadProgress } from "@/domain/provider.ts";
import { ChatEngine } from "@/engine/chat-engine.ts";
import {
  FALLBACK_PROVIDER,
  getProvider,
  type ProviderStatus,
  probeProviders,
  selectDefaultProvider,
} from "@/engine/providers/provider-registry.ts";
import { createChunkBatcher } from "@/lib/chunk-batcher.ts";
import { createId } from "@/lib/id.ts";
import {
  deleteConversationRow,
  loadConversations,
  pruneConversations,
  saveConversation,
} from "./database.ts";
import { useSettings } from "./settings-store.ts";

function createConversation(): Conversation {
  const now = Date.now();
  return {
    id: createId(),
    title: NEW_CONVERSATION_TITLE,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

type ChatState = {
  readonly conversations: readonly Conversation[];
  readonly activeId: string;
  /** False until IndexedDB has been read, so the UI can avoid a flash of empty. */
  readonly isHydrated: boolean;

  readonly providerStatuses: readonly ProviderStatus[];
  readonly activeProvider: ChatProvider | undefined;
  readonly downloadProgress: DownloadProgress | undefined;
  readonly providerError: string | undefined;
  readonly isGenerating: boolean;
};

const initialConversation = createConversation();

/**
 * Application state.
 *
 * Zustand with selector-based reads: the hot path is appending text to one
 * message many times a second, and a selector means only the components that
 * actually read the changed slice re-render. The transcript is treated as
 * immutable, which keeps retry, history and persistence straightforward.
 */
export const useChat = create<ChatState>(() => ({
  conversations: [initialConversation],
  activeId: initialConversation.id,
  isHydrated: false,

  providerStatuses: [],
  activeProvider: undefined,
  downloadProgress: undefined,
  providerError: undefined,
  isGenerating: false,
}));

const { setState, getState } = useChat;
const engine = new ChatEngine();

/*
 * Selectors. Exported so components never inline a slice expression and
 * accidentally return a fresh object on every render.
 */

export const selectActiveConversation = (state: ChatState): Conversation =>
  state.conversations.find((conversation) => conversation.id === state.activeId) ??
  state.conversations[0] ??
  initialConversation;

export const selectMessages = (state: ChatState): readonly Message[] =>
  selectActiveConversation(state).messages;

/*
 * Thread mutation.
 */

function updateConversation(
  id: string,
  update: (conversation: Conversation) => Conversation,
  options: { readonly persist?: boolean } = {},
): void {
  let updated: Conversation | undefined;

  setState((state) => ({
    conversations: state.conversations.map((conversation) => {
      if (conversation.id !== id) return conversation;
      updated = update(conversation);
      return updated;
    }),
  }));

  // Streaming writes skip persistence: saving on every frame would mean hundreds
  // of IndexedDB transactions per reply. The turn is saved once when it settles.
  if (options.persist !== false && updated) {
    void saveConversation(updated);
  }
}

function appendMessage(conversationId: string, message: Message): void {
  updateConversation(conversationId, (conversation) => {
    const messages = [...conversation.messages, message];
    return {
      ...conversation,
      messages,
      title:
        conversation.title === NEW_CONVERSATION_TITLE
          ? deriveTitle(messages)
          : conversation.title,
      updatedAt: Date.now(),
    };
  });
}

function patchMessage(
  conversationId: string,
  messageId: string,
  patch: (message: AssistantMessage) => AssistantMessage,
  options: { readonly persist?: boolean } = {},
): void {
  updateConversation(
    conversationId,
    (conversation) => ({
      ...conversation,
      messages: conversation.messages.map((message) =>
        message.id === messageId && message.role === "assistant"
          ? patch(message)
          : message,
      ),
      updatedAt: Date.now(),
    }),
    options,
  );
}

/*
 * Actions.
 */

export function newConversation(): void {
  const conversation = createConversation();
  setState((state) => ({
    conversations: [conversation, ...state.conversations],
    activeId: conversation.id,
  }));
}

export function selectConversation(id: string): void {
  if (id === getState().activeId) return;
  engine.stop();
  setState({ activeId: id, isGenerating: false });
}

export function deleteConversation(id: string): void {
  void deleteConversationRow(id);

  setState((state) => {
    const remaining = state.conversations.filter(
      (conversation) => conversation.id !== id,
    );

    if (remaining.length === 0) {
      const fresh = createConversation();
      return { conversations: [fresh], activeId: fresh.id };
    }

    return {
      conversations: remaining,
      activeId:
        state.activeId === id ? (remaining[0]?.id ?? state.activeId) : state.activeId,
    };
  });
}

export function clearActiveConversation(): void {
  engine.stop();
  setState({ isGenerating: false });

  updateConversation(getState().activeId, (conversation) => ({
    ...conversation,
    title: NEW_CONVERSATION_TITLE,
    messages: [],
    updatedAt: Date.now(),
  }));
}

export function stopGenerating(): void {
  engine.stop();
}

/** Sends a message and streams the reply into the transcript. */
export async function sendMessage(text: string): Promise<void> {
  const trimmed = text.trim();
  if (trimmed.length === 0 || getState().isGenerating) return;

  const conversationId = getState().activeId;

  appendMessage(conversationId, {
    id: createId(),
    role: "user",
    text: trimmed,
    createdAt: Date.now(),
  });

  await generateReply(conversationId);
}

/**
 * Discards the last assistant reply and generates a new one for the same user
 * message — the fix for a stopped, failed, or simply unhelpful answer.
 */
export async function retryLastReply(): Promise<void> {
  if (getState().isGenerating) return;

  const conversationId = getState().activeId;
  const current = selectActiveConversation(getState()).messages;
  const lastIndex = current.findLastIndex((message) => message.role === "assistant");
  if (lastIndex === -1) return;

  updateConversation(conversationId, (conversation) => ({
    ...conversation,
    messages: conversation.messages.slice(0, lastIndex),
    updatedAt: Date.now(),
  }));

  await generateReply(conversationId);
}

async function generateReply(conversationId: string): Promise<void> {
  const provider = await resolveProvider();
  const replyId = createId();

  appendMessage(conversationId, {
    id: replyId,
    role: "assistant",
    text: "",
    createdAt: Date.now(),
    source: provider.id,
    status: "streaming",
    attachments: [],
  });

  setState({ isGenerating: true });

  const stream = createChunkBatcher((text) => {
    patchMessage(
      conversationId,
      replyId,
      (message) => ({ ...message, text: message.text + text }),
      { persist: false },
    );
  });

  const history = selectActiveConversation(getState()).messages.filter(
    (message) => message.id !== replyId,
  );

  const settle = (status: AssistantMessage["status"], error?: string) => {
    stream.flush();
    patchMessage(conversationId, replyId, (message) => ({
      ...message,
      status,
      ...(error === undefined ? {} : { error }),
    }));
    setState({ isGenerating: false });
  };

  await engine.run(provider, history, {
    onChunk: stream.push,
    onComplete: () => settle("complete"),
    onStopped: () => settle("stopped"),
    onError: (error) => settle("failed", error),
  });
}

/**
 * Resolves the provider to answer with, waiting for startup probing if it has
 * not finished.
 *
 * Sending before probing completes is entirely possible — the suggested-prompt
 * chips make it a single click. Returning early there dropped the turn silently:
 * the message appeared and nothing ever answered it. The rule provider needs
 * nothing to be ready, so it guarantees every turn gets a reply.
 */
async function resolveProvider(): Promise<ChatProvider> {
  const current = getState().activeProvider;
  if (current) return current;

  await providersReady;

  return getState().activeProvider ?? FALLBACK_PROVIDER;
}

/*
 * Lifecycle. Called once from `main.tsx`.
 */

let providersReady: Promise<void> = Promise.resolve();

/** Reads persisted threads out of IndexedDB. */
export async function hydrate(): Promise<void> {
  const stored = await loadConversations();

  setState((state) => ({
    // An empty database means a first visit; keep the blank thread already in
    // state rather than rendering a list with nothing in it.
    conversations: stored.length > 0 ? stored : state.conversations,
    activeId: stored[0]?.id ?? state.activeId,
    isHydrated: true,
  }));

  void pruneConversations();
}

/** Probes providers and activates the preferred one, or the best default. */
export function initialiseProviders(): Promise<void> {
  providersReady = (async () => {
    try {
      const statuses = await probeProviders();
      const preferred = useSettings.getState().preferredProviderId;
      const preferredStatus = statuses.find(
        (status) => status.provider.id === preferred,
      );

      setState({
        providerStatuses: statuses,
        // Only honour a stored choice if it is still usable without a download —
        // otherwise enabling WebLLM once would re-trigger the download on every
        // visit before the UI appeared.
        activeProvider:
          preferredStatus?.availability.state === "ready"
            ? preferredStatus.provider
            : selectDefaultProvider(statuses),
      });
    } catch {
      // Probing is best-effort; the baseline provider needs nothing probed.
      setState({ activeProvider: FALLBACK_PROVIDER });
    }
  })();

  return providersReady;
}

/**
 * Switches provider, downloading weights first if required. Reports progress and
 * leaves the previous provider active on failure.
 */
export async function activateProvider(id: ReplySource): Promise<void> {
  const provider = getProvider(id);
  const previous = getState().activeProvider;

  setState({ providerError: undefined });

  try {
    const availability = await provider.availability();

    if (availability.state === "unavailable") {
      setState({ providerError: describeUnavailable(availability.reason) });
      return;
    }

    if (availability.state === "needs-download") {
      setState({ downloadProgress: { label: "Starting download" } });
      await provider.prepare((progress) => setState({ downloadProgress: progress }));
    }

    useSettings.getState().setPreferredProvider(id);
    setState({ activeProvider: provider, providerStatuses: await probeProviders() });
  } catch (error) {
    setState({
      activeProvider: previous,
      providerError:
        error instanceof Error ? error.message : "Could not start that model.",
    });
  } finally {
    setState({ downloadProgress: undefined });
  }
}

function describeUnavailable(reason: string): string {
  switch (reason) {
    case "no-webgpu":
      return "This browser has no WebGPU support, which the local model needs.";
    case "unsupported-browser":
      return "This browser does not ship a built-in AI model.";
    case "insufficient-resources":
      return "This device does not have the free storage or memory the model needs.";
    default:
      return "That model is not available on this device.";
  }
}
