import type { Conversation } from "@/domain/conversation.ts";
import type { Attachment, Message } from "@/domain/message.ts";

/**
 * Thread persistence, kept behind a narrow module so the store never touches
 * storage APIs directly and tests can run without one.
 *
 * `localStorage` rather than IndexedDB: the payload is plain text on the order of
 * kilobytes, reads happen once at startup, and a synchronous read before first
 * paint is simpler than an async migration story. If attachments later carry
 * binary payloads this is the one file that has to change.
 */

const STORAGE_KEY = "chat-buddy:threads";
const SCHEMA_VERSION = 1;

/** Cap on persisted threads, oldest evicted first, to bound storage growth. */
const MAX_THREADS = 50;

type PersistedShape = {
  readonly version: number;
  readonly conversations: readonly Conversation[];
};

function storage(): Storage | undefined {
  try {
    // Access throws outright in some privacy modes, so probe rather than assume.
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function loadConversations(): Conversation[] {
  const store = storage();
  if (!store) return [];

  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!isPersistedShape(parsed) || parsed.version !== SCHEMA_VERSION) return [];

    return parsed.conversations.filter(isConversation).map(normalise);
  } catch {
    // Corrupt or foreign data is not worth recovering; start clean.
    return [];
  }
}

export function saveConversations(conversations: readonly Conversation[]): void {
  const store = storage();
  if (!store) return;

  const trimmed = [...conversations]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_THREADS);

  const payload: PersistedShape = {
    version: SCHEMA_VERSION,
    conversations: trimmed,
  };

  try {
    store.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Quota exceeded, or storage disabled mid-session. Losing history is
    // preferable to breaking the send that triggered the write.
  }
}

/*
 * Validation. Persisted data is untrusted input — it may have been written by an
 * older build, hand-edited, or truncated by a quota error — so every field is
 * checked before it reaches the typed domain model.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPersistedShape(value: unknown): value is PersistedShape {
  return (
    isRecord(value) &&
    typeof value.version === "number" &&
    Array.isArray(value.conversations)
  );
}

function isAttachment(value: unknown): value is Attachment {
  return (
    isRecord(value) &&
    typeof value.kind === "string" &&
    typeof value.skillId === "string"
  );
}

function isMessage(value: unknown): value is Message {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string") return false;
  if (typeof value.text !== "string") return false;
  if (typeof value.createdAt !== "number") return false;

  if (value.role === "user") return true;
  if (value.role !== "assistant") return false;

  return (
    typeof value.source === "string" &&
    typeof value.status === "string" &&
    Array.isArray(value.attachments) &&
    value.attachments.every(isAttachment)
  );
}

function isConversation(value: unknown): value is Conversation {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.createdAt === "number" &&
    typeof value.updatedAt === "number" &&
    Array.isArray(value.messages) &&
    value.messages.every(isMessage)
  );
}

/**
 * Repairs states that cannot exist at rest: a thread saved mid-generation would
 * otherwise reload with a message stuck in `streaming` and a caret that never
 * stops blinking.
 */
function normalise(conversation: Conversation): Conversation {
  return {
    ...conversation,
    messages: conversation.messages.map((message) =>
      message.role === "assistant" && message.status === "streaming"
        ? { ...message, status: "stopped" as const }
        : message,
    ),
  };
}
