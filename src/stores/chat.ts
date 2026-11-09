import { create } from "zustand";

import {
  deleteConversationRow,
  loadConversations,
  pruneConversations,
  saveConversation,
} from "@/db/conversations.ts";
import {
  type Conversation,
  deriveTitle,
  NEW_CONVERSATION_TITLE,
} from "@/domain/conversation.ts";
import type { AssistantMessage, Message, ReplySource } from "@/domain/message.ts";
import type { ChatProvider, DownloadProgress } from "@/domain/provider.ts";
import { ChatEngine } from "@/engine/chat.ts";
import {
  FALLBACK_PROVIDER,
  getProvider,
  LOCAL_PROVIDER,
  type ProviderStatus,
  probeProviders,
  selectDefaultProvider,
  UNAVAILABLE_COPY,
} from "@/engine/providers/registry.ts";
import { createChunkBatcher } from "@/lib/batch.ts";
import { createId } from "@/lib/id.ts";

import { useConfig } from "./config.ts";

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

/** What the thread list needs to render a row: no messages. */
export type ThreadSummary = {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: number;
  readonly pinned: boolean;
};

let threadList: readonly ThreadSummary[] = [];

/**
 * Non-empty threads, most recent first, as a referentially stable list.
 *
 * Streaming rewrites a conversation many times a second, but changes none of
 * these fields (`updatedAt` moves only when the turn settles), so the cached list
 * is returned and the sidebar does not re-render while a reply streams.
 */
export function selectThreadList(state: ChatState): readonly ThreadSummary[] {
  const next = state.conversations
    .filter((conversation) => conversation.messages.length > 0)
    .toSorted((a, b) => b.updatedAt - a.updatedAt);

  const isSame =
    next.length === threadList.length &&
    next.every((conversation, index) => {
      const previous = threadList[index];
      return (
        previous?.id === conversation.id &&
        previous.title === conversation.title &&
        previous.updatedAt === conversation.updatedAt &&
        previous.pinned === (conversation.pinned ?? false)
      );
    });

  if (!isSame) {
    threadList = next.map(({ id, title, updatedAt, pinned }) => ({
      id,
      title,
      updatedAt,
      pinned: pinned ?? false,
    }));
  }
  return threadList;
}

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
      // Streaming slices leave recency alone; the settled write moves it once.
      updatedAt: options.persist === false ? conversation.updatedAt : Date.now(),
    }),
    options,
  );
}

/*
 * Actions.
 */

export function newConversation(): void {
  // Reuse an untouched thread rather than stacking blank ones on every click.
  const blank = getState().conversations.find(
    (conversation) => conversation.messages.length === 0,
  );
  if (blank) {
    if (blank.id !== getState().activeId) selectConversation(blank.id);
    return;
  }

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

/** Deletes a thread and returns it, so the caller can offer an undo. */
export function deleteConversation(id: string): Conversation | undefined {
  const removed = getState().conversations.find(
    (conversation) => conversation.id === id,
  );
  if (id === getState().activeId) engine.stop();
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

  return removed;
}

/**
 * Puts a deleted thread back, in place and persisted again. A blank thread created
 * only because the list had emptied is dropped, so undo restores exactly what was
 * there before.
 */
export function restoreConversation(conversation: Conversation): void {
  setState((state) => ({
    conversations: [
      conversation,
      ...state.conversations.filter(
        (existing) => existing.id !== conversation.id && existing.messages.length > 0,
      ),
    ],
    activeId: conversation.id,
  }));
  void saveConversation(conversation);
}

/** Renames a thread. A blank name is ignored rather than saved. */
export function renameConversation(id: string, title: string): void {
  const trimmed = title.trim().slice(0, 80);
  if (trimmed.length === 0) return;
  // Not a content change, so recency (and the thread's place in the list) stays.
  updateConversation(id, (conversation) => ({ ...conversation, title: trimmed }));
}

/** Pins a thread to the top of the list, or unpins it. */
export function togglePinned(id: string): void {
  updateConversation(id, ({ pinned, ...conversation }) =>
    pinned ? conversation : { ...conversation, pinned: true },
  );
}

/**
 * Adds imported threads. A thread already present is replaced only when the
 * imported copy is newer, so importing the same backup twice changes nothing.
 * Returns how many were added or updated.
 */
export function importConversations(incoming: readonly Conversation[]): number {
  const existing = new Map(
    getState().conversations.map((thread) => [thread.id, thread]),
  );
  const accepted = incoming.filter((thread) => {
    const current = existing.get(thread.id);
    return current === undefined || thread.updatedAt > current.updatedAt;
  });
  if (accepted.length === 0) return 0;

  const acceptedIds = new Set(accepted.map((thread) => thread.id));
  setState((state) => ({
    conversations: [
      ...accepted,
      ...state.conversations.filter((thread) => !acceptedIds.has(thread.id)),
    ],
  }));
  for (const thread of accepted) void saveConversation(thread);
  return accepted.length;
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

/**
 * Rewrites one of the person's messages and regenerates from there: everything
 * after it is discarded, as it answered a question that no longer exists. The
 * thread is retitled when its first message is the one edited.
 */
export async function editMessage(messageId: string, text: string): Promise<void> {
  const trimmed = text.trim();
  if (trimmed.length === 0) return;

  engine.stop();
  const conversationId = getState().activeId;
  const messages = selectActiveConversation(getState()).messages;
  const index = messages.findIndex(
    (message) => message.id === messageId && message.role === "user",
  );
  const original = messages[index];
  if (!original || original.role !== "user") return;

  updateConversation(conversationId, (conversation) => {
    const kept = [
      ...conversation.messages.slice(0, index),
      { ...original, text: trimmed },
    ];
    return {
      ...conversation,
      messages: kept,
      title: index === 0 ? deriveTitle(kept) : conversation.title,
      updatedAt: Date.now(),
    };
  });

  setState({ isGenerating: false });
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
    LOCAL_PROVIDER.selectModel(useConfig.getState().localModelId);
    try {
      const statuses = await probeProviders();
      const preferred = useConfig.getState().preferredProviderId;
      const preferredStatus = statuses.find(
        (status) => status.provider.id === preferred,
      );

      const isReady = preferredStatus?.availability.state === "ready";

      setState({
        providerStatuses: statuses,
        // A stored choice that needs a download is not honoured — enabling WebLLM
        // once must not re-trigger a 950 MB download on every visit.
        activeProvider:
          isReady && preferredStatus
            ? preferredStatus.provider
            : selectDefaultProvider(statuses),
      });

      // Weights already on the device: answer with the default meanwhile, and load
      // the chosen model in the background (seconds, no network), then switch.
      if (preferred && preferredStatus?.availability.state === "downloaded") {
        void activateProvider(preferred);
      }
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
const LOADING_LABEL = "Loading model…";

/**
 * Turns raw provider progress into what the person should see. A download that
 * has reached 100% is not finished: the weights still have to be compiled onto
 * the GPU, which takes seconds and reports no ratio. Showing a frozen "100%"
 * there read as a hang, so that phase becomes an indeterminate "Loading model…".
 */
function phase(progress: DownloadProgress): DownloadProgress {
  if (progress.ratio === undefined || progress.ratio >= 0.999) {
    return { label: LOADING_LABEL };
  }
  return progress;
}

export async function activateProvider(id: ReplySource): Promise<void> {
  const provider = getProvider(id);
  const previous = getState().activeProvider;

  setState({ providerError: undefined });

  try {
    const availability = await provider.availability();

    if (availability.state === "unavailable") {
      setState({ providerError: UNAVAILABLE_COPY[availability.reason].long });
      return;
    }

    if (
      availability.state === "needs-download" ||
      availability.state === "downloaded"
    ) {
      setState({ downloadProgress: { label: LOADING_LABEL } });
      await provider.prepare((progress) =>
        setState({ downloadProgress: phase(progress) }),
      );
    }

    useConfig.getState().setPreferredProvider(id);
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

/**
 * Stops using the local model — after its weights were deleted, say — and falls
 * back to the best provider that needs nothing downloaded.
 */
export async function releaseLocalModel(): Promise<void> {
  await LOCAL_PROVIDER.dispose();
  const statuses = await probeProviders();
  setState((state) => ({
    providerStatuses: statuses,
    activeProvider:
      state.activeProvider?.id === "web-llm"
        ? selectDefaultProvider(statuses)
        : state.activeProvider,
  }));
}

/** Re-reads every provider's availability, e.g. after a download finishes. */
export async function refreshProviders(): Promise<void> {
  setState({ providerStatuses: await probeProviders() });
}
