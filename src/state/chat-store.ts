import { batch, computed, effect, signal } from "@preact/signals";
import {
  type Conversation,
  deriveTitle,
  NEW_CONVERSATION_TITLE,
} from "@/domain/conversation.ts";
import type { AssistantMessage, Message, ReplySource } from "@/domain/message.ts";
import type { ChatProvider, DownloadProgress } from "@/domain/provider.ts";
import { ChatEngine } from "@/engine/chat-engine.ts";
import {
  getProvider,
  type ProviderStatus,
  probeProviders,
  selectDefaultProvider,
} from "@/engine/providers/provider-registry.ts";
import { createId } from "@/lib/id.ts";
import { loadConversations, saveConversations } from "./persistence.ts";
import { preferredProviderId, setPreferredProvider } from "./settings-store.ts";

/*
 * Application state.
 *
 * Signals rather than a reducer: the hot path here is appending a token to one
 * message many times a second, and a signal lets only the bubble that changed
 * re-render. The transcript is otherwise treated as immutable, so history,
 * retry and persistence stay straightforward.
 */

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

const restored = loadConversations();
const initial = restored.length > 0 ? restored : [createConversation()];

export const conversations = signal<readonly Conversation[]>(initial);
export const activeConversationId = signal<string>(initial[0]?.id ?? createId());

/** Provider availability, populated by `initialiseProviders`. */
export const providerStatuses = signal<readonly ProviderStatus[]>([]);
export const activeProvider = signal<ChatProvider | undefined>(undefined);

/** Non-undefined while a provider is downloading or initialising weights. */
export const downloadProgress = signal<DownloadProgress | undefined>(undefined);

/** Set when preparing a provider fails, so the UI can offer a way back. */
export const providerError = signal<string | undefined>(undefined);

export const isGenerating = signal(false);

export const activeConversation = computed<Conversation>(() => {
  const id = activeConversationId.value;
  const found = conversations.value.find((conversation) => conversation.id === id);
  return found ?? conversations.value[0] ?? createConversation();
});

export const messages = computed<readonly Message[]>(
  () => activeConversation.value.messages,
);

/** Threads for the sidebar, most recently used first. */
export const orderedConversations = computed<readonly Conversation[]>(() =>
  [...conversations.value].sort((a, b) => b.updatedAt - a.updatedAt),
);

const engine = new ChatEngine();

/*
 * Thread mutation.
 */

function updateConversation(
  id: string,
  update: (conversation: Conversation) => Conversation,
): void {
  conversations.value = conversations.value.map((conversation) =>
    conversation.id === id ? update(conversation) : conversation,
  );
}

function withMessages(
  conversation: Conversation,
  messagesNext: readonly Message[],
): Conversation {
  return {
    ...conversation,
    messages: messagesNext,
    // Re-derive the title until the thread has been named by its first turn.
    title:
      conversation.title === NEW_CONVERSATION_TITLE
        ? deriveTitle(messagesNext)
        : conversation.title,
    updatedAt: Date.now(),
  };
}

function appendMessage(conversationId: string, message: Message): void {
  updateConversation(conversationId, (conversation) =>
    withMessages(conversation, [...conversation.messages, message]),
  );
}

function patchMessage(
  conversationId: string,
  messageId: string,
  patch: (message: AssistantMessage) => AssistantMessage,
): void {
  updateConversation(conversationId, (conversation) => ({
    ...conversation,
    messages: conversation.messages.map((message) =>
      message.id === messageId && message.role === "assistant"
        ? patch(message)
        : message,
    ),
    updatedAt: Date.now(),
  }));
}

/*
 * Public actions.
 */

export function newConversation(): void {
  const conversation = createConversation();
  batch(() => {
    conversations.value = [conversation, ...conversations.value];
    activeConversationId.value = conversation.id;
  });
}

export function selectConversation(id: string): void {
  if (id === activeConversationId.value) return;
  engine.stop();
  batch(() => {
    isGenerating.value = false;
    activeConversationId.value = id;
  });
}

export function deleteConversation(id: string): void {
  const remaining = conversations.value.filter(
    (conversation) => conversation.id !== id,
  );

  batch(() => {
    if (remaining.length === 0) {
      const fresh = createConversation();
      conversations.value = [fresh];
      activeConversationId.value = fresh.id;
      return;
    }

    conversations.value = remaining;
    if (activeConversationId.value === id) {
      activeConversationId.value = remaining[0]?.id ?? createId();
    }
  });
}

export function clearActiveConversation(): void {
  engine.stop();
  const id = activeConversationId.value;
  batch(() => {
    isGenerating.value = false;
    updateConversation(id, (conversation) => ({
      ...conversation,
      title: NEW_CONVERSATION_TITLE,
      messages: [],
      updatedAt: Date.now(),
    }));
  });
}

export function stopGenerating(): void {
  engine.stop();
}

/** Sends a message and streams the reply into the transcript. */
export async function sendMessage(text: string): Promise<void> {
  const trimmed = text.trim();
  if (trimmed.length === 0 || isGenerating.value) return;

  const conversationId = activeConversationId.value;

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
  if (isGenerating.value) return;

  const conversationId = activeConversationId.value;
  const current = activeConversation.value.messages;
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
  const provider = activeProvider.value;
  if (!provider) return;

  const replyId = createId();

  const placeholder: AssistantMessage = {
    id: replyId,
    role: "assistant",
    text: "",
    createdAt: Date.now(),
    source: provider.id,
    status: "streaming",
    attachments: [],
  };

  batch(() => {
    isGenerating.value = true;
    appendMessage(conversationId, placeholder);
  });

  // Buffer chunks and flush on a frame, so a fast model cannot force one
  // re-render per token.
  const flush = createChunkFlusher((text) => {
    patchMessage(conversationId, replyId, (message) => ({
      ...message,
      text: message.text + text,
    }));
  });

  const snapshot =
    conversations.value.find((conversation) => conversation.id === conversationId)
      ?.messages ?? [];

  // The placeholder itself must not be sent to the model.
  const history = snapshot.filter((message) => message.id !== replyId);

  await engine.run(provider, history, {
    onChunk: flush.push,
    onComplete() {
      flush.finish();
      patchMessage(conversationId, replyId, (message) => ({
        ...message,
        status: "complete",
      }));
      isGenerating.value = false;
    },
    onStopped() {
      flush.finish();
      patchMessage(conversationId, replyId, (message) => ({
        ...message,
        status: "stopped",
      }));
      isGenerating.value = false;
    },
    onError(error) {
      flush.finish();
      patchMessage(conversationId, replyId, (message) => ({
        ...message,
        status: "failed",
        error,
      }));
      isGenerating.value = false;
    },
  });
}

/**
 * Coalesces streamed chunks into one write per animation frame.
 *
 * Without this a model emitting 60 tokens a second drives 60 store writes and 60
 * re-renders a second; with it, the cost is one per frame regardless of rate.
 */
function createChunkFlusher(commit: (text: string) => void) {
  let pending = "";
  let frame: number | undefined;

  const flush = () => {
    frame = undefined;
    if (pending.length === 0) return;
    const text = pending;
    pending = "";
    commit(text);
  };

  return {
    push(chunk: string) {
      pending += chunk;
      frame ??= requestAnimationFrame(flush);
    },
    finish() {
      if (frame !== undefined) cancelAnimationFrame(frame);
      flush();
    },
  };
}

/*
 * Provider lifecycle.
 */

/** Probes providers and activates the preferred one, or the best default. */
export async function initialiseProviders(): Promise<void> {
  const statuses = await probeProviders();
  providerStatuses.value = statuses;

  const preferred = preferredProviderId.value;
  const preferredStatus = statuses.find((status) => status.provider.id === preferred);

  // Only honour a stored choice if it is still usable without a download —
  // otherwise a person who enabled WebLLM once would re-trigger the download on
  // every visit before seeing the UI.
  if (preferredStatus?.availability.state === "ready") {
    activeProvider.value = preferredStatus.provider;
    return;
  }

  activeProvider.value = selectDefaultProvider(statuses);
}

/**
 * Switches provider, downloading weights first if required. Reports progress
 * through `downloadProgress` and leaves the previous provider active on failure.
 */
export async function activateProvider(id: ReplySource): Promise<void> {
  const provider = getProvider(id);
  const previous = activeProvider.value;

  providerError.value = undefined;

  try {
    const availability = await provider.availability();

    if (availability.state === "unavailable") {
      providerError.value = describeUnavailable(availability.reason);
      return;
    }

    if (availability.state === "needs-download") {
      downloadProgress.value = { label: "Starting download" };
      await provider.prepare((progress) => {
        downloadProgress.value = progress;
      });
    }

    batch(() => {
      activeProvider.value = provider;
      setPreferredProvider(id);
    });

    providerStatuses.value = await probeProviders();
  } catch (error) {
    providerError.value =
      error instanceof Error ? error.message : "Could not start that model.";
    activeProvider.value = previous;
  } finally {
    downloadProgress.value = undefined;
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

/**
 * Starts persisting threads. Called once from `main.tsx`; kept out of module
 * scope so importing the store in a test writes nothing to storage.
 */
export function startChatPersistence(): void {
  effect(() => {
    saveConversations(conversations.value);
  });
}
