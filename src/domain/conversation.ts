import type { Message } from "./message.ts";

export type Conversation = {
  readonly id: string;
  readonly title: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly messages: readonly Message[];
};

/** Longest a derived title may run before it is ellipsised. */
const TITLE_MAX_LENGTH = 48;

export const NEW_CONVERSATION_TITLE = "New chat";

/**
 * Derives a thread title from its first user message, so the sidebar reads like
 * a list of topics instead of a list of timestamps.
 */
export function deriveTitle(messages: readonly Message[]): string {
  const first = messages.find((message) => message.role === "user");
  if (!first) return NEW_CONVERSATION_TITLE;

  const flat = first.text.replace(/\s+/g, " ").trim();
  if (flat.length === 0) return NEW_CONVERSATION_TITLE;
  if (flat.length <= TITLE_MAX_LENGTH) return flat;

  // Prefer breaking on a word boundary rather than mid-word.
  const clipped = flat.slice(0, TITLE_MAX_LENGTH);
  const lastSpace = clipped.lastIndexOf(" ");
  const body =
    lastSpace > TITLE_MAX_LENGTH * 0.6 ? clipped.slice(0, lastSpace) : clipped;

  return `${body.trimEnd()}…`;
}

export function isEmptyConversation(conversation: Conversation): boolean {
  return conversation.messages.length === 0;
}
