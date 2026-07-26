import Dexie, { type EntityTable } from "dexie";
import type { Conversation } from "@/domain/conversation.ts";
import type { Attachment, Message } from "@/domain/message.ts";

/**
 * Thread persistence on IndexedDB, via Dexie.
 *
 * IndexedDB rather than `localStorage`: writes are asynchronous so streaming a
 * long reply never blocks the main thread, the quota is measured in hundreds of
 * megabytes rather than five, and structured values are stored without a
 * `JSON.stringify` round-trip on every keystroke. It also leaves room for
 * attachments to carry binary payloads later without changing the storage layer.
 *
 * Dexie owns the schema and versioning; everything below it is plain domain
 * types, so nothing outside this module knows a database exists.
 */

/** Cap on stored threads, oldest evicted first, to bound growth. */
const MAX_THREADS = 200;

/**
 * Rows are the domain `Conversation` verbatim. Keeping them identical avoids a
 * mapping layer whose only job would be renaming fields.
 */
type ConversationRow = Conversation;

class ChatBuddyDatabase extends Dexie {
  /** `updatedAt` is indexed because every read is ordered by recency. */
  conversations!: EntityTable<ConversationRow, "id">;

  constructor() {
    super("chat-buddy");
    this.version(1).stores({
      conversations: "id, updatedAt",
    });
  }
}

const database = new ChatBuddyDatabase();

/**
 * Loads every thread, most recently updated first.
 *
 * Resolves to an empty list on any failure. IndexedDB is unavailable in some
 * private-browsing modes and can be blocked outright by storage settings; losing
 * history is a far better outcome than failing to start.
 */
export async function loadConversations(): Promise<Conversation[]> {
  try {
    const rows = await database.conversations.orderBy("updatedAt").reverse().toArray();
    return rows.filter(isConversation).map(normalise);
  } catch {
    return [];
  }
}

/** Inserts or updates one thread. */
export async function saveConversation(conversation: Conversation): Promise<void> {
  try {
    await database.conversations.put(conversation);
  } catch {
    // Quota exceeded or storage disabled mid-session. Never let a failed write
    // break the send that triggered it.
  }
}

export async function deleteConversationRow(id: string): Promise<void> {
  try {
    await database.conversations.delete(id);
  } catch {
    // See `saveConversation`.
  }
}

/** Drops the oldest threads once the table exceeds `MAX_THREADS`. */
export async function pruneConversations(): Promise<void> {
  try {
    const count = await database.conversations.count();
    if (count <= MAX_THREADS) return;

    const excess = await database.conversations
      .orderBy("updatedAt")
      .limit(count - MAX_THREADS)
      .primaryKeys();

    await database.conversations.bulkDelete(excess);
  } catch {
    // Pruning is housekeeping; failing it is not worth surfacing.
  }
}

/*
 * Validation.
 *
 * Stored rows are untrusted input: they may have been written by an older build,
 * edited by hand in devtools, or left half-written by a failed transaction. Every
 * field is checked before it re-enters the typed domain model.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

export function isConversation(value: unknown): value is Conversation {
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
 * otherwise reload with a message stuck in `streaming`, waiting on a stream that
 * no longer exists.
 */
export function normalise(conversation: Conversation): Conversation {
  const needsRepair = conversation.messages.some(
    (message) => message.role === "assistant" && message.status === "streaming",
  );

  if (!needsRepair) return conversation;

  return {
    ...conversation,
    messages: conversation.messages.map((message) =>
      message.role === "assistant" && message.status === "streaming"
        ? { ...message, status: "stopped" as const }
        : message,
    ),
  };
}
