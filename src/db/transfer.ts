import type { Conversation } from "@/domain/conversation.ts";

import { isConversation, normalise } from "./conversations.ts";

/**
 * Moving chats in and out of the app: a JSON backup that round-trips exactly, and
 * a Markdown transcript for reading or sharing.
 *
 * Imported files are untrusted input, so they pass the same validation and repair
 * as rows read back from IndexedDB — nothing malformed reaches the store.
 */

const FORMAT = "chat-buddy";
const VERSION = 1;

type Backup = {
  readonly format: typeof FORMAT;
  readonly version: number;
  readonly exportedAt: string;
  readonly conversations: readonly Conversation[];
};

export function toBackup(
  conversations: readonly Conversation[],
  now = new Date(),
): string {
  const backup: Backup = {
    format: FORMAT,
    version: VERSION,
    exportedAt: now.toISOString(),
    conversations: conversations.filter(
      (conversation) => conversation.messages.length > 0,
    ),
  };
  return JSON.stringify(backup, null, 2);
}

export type ImportResult =
  | {
      readonly ok: true;
      readonly conversations: readonly Conversation[];
      readonly skipped: number;
    }
  | { readonly ok: false; readonly error: string };

/** Reads a backup (or a bare array of threads). Invalid threads are skipped, not fatal. */
export function fromBackup(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't valid JSON." };
  }

  const list: unknown =
    typeof parsed === "object" && parsed !== null && "conversations" in parsed
      ? parsed.conversations
      : parsed;

  if (!Array.isArray(list)) {
    return { ok: false, error: "That file doesn't look like a Chat Buddy backup." };
  }

  const valid = list.filter(isConversation).map(normalise);
  return { ok: true, conversations: valid, skipped: list.length - valid.length };
}

/** A readable transcript of one thread. */
export function toMarkdown(conversation: Conversation): string {
  const lines = [`# ${conversation.title}`, ""];
  for (const message of conversation.messages) {
    const speaker = message.role === "user" ? "You" : "Chat Buddy";
    lines.push(`**${speaker}:**`, "", message.text.trim() || "_(no reply)_", "");
  }
  return lines.join("\n");
}

/** A file name from a thread title: lower-case, dashes, no odd characters. */
export function fileName(title: string, extension: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return `${slug || "chat"}.${extension}`;
}
