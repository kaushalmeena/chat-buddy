/**
 * The conversation record. These types are the contract between the inference
 * layer, the persistence layer and the UI, so they stay free of dependencies on
 * any of the three.
 */

export type MessageRole = "user" | "assistant";

/**
 * Where an assistant message came from. Surfaced in the UI so a person can
 * always tell whether a reply was generated on-device or matched from the
 * built-in rules.
 */
export type ReplySource = "prompt-api" | "web-llm" | "rules";

/**
 * The lifecycle of an assistant message. `streaming` means tokens are still
 * arriving and `text` is a partial value; `stopped` means the person aborted
 * mid-generation and the partial text is intentionally kept.
 */
export type MessageStatus = "streaming" | "complete" | "stopped" | "failed";

/**
 * Structured output attached to a message alongside its prose.
 *
 * Skills return attachments rather than markup, which keeps rendering
 * decisions in the UI layer and means no skill can inject HTML. The union is
 * the extension point: adding a renderer is adding a variant here plus a case
 * in the attachment renderer. No variants ship yet — see `skills/registry.ts`.
 */
export type Attachment = {
  readonly kind: string;
  readonly skillId: string;
};

export type UserMessage = {
  readonly id: string;
  readonly role: "user";
  readonly text: string;
  readonly createdAt: number;
};

export type AssistantMessage = {
  readonly id: string;
  readonly role: "assistant";
  readonly text: string;
  readonly createdAt: number;
  readonly source: ReplySource;
  readonly status: MessageStatus;
  readonly attachments: readonly Attachment[];
  /** Present when `status` is `failed`; shown in place of the bubble body. */
  readonly error?: string;
};

export type Message = UserMessage | AssistantMessage;

export function isAssistantMessage(message: Message): message is AssistantMessage {
  return message.role === "assistant";
}

/** True while a message is still receiving tokens. */
export function isStreaming(message: Message): boolean {
  return isAssistantMessage(message) && message.status === "streaming";
}

/**
 * A conversation turn as handed to a provider: the transcript trimmed to what
 * the provider needs, with no UI-only fields.
 */
export type ProviderTurn = {
  readonly role: MessageRole;
  readonly content: string;
};

/**
 * Projects a transcript onto the provider contract, dropping anything a model
 * should not see: failed generations and blank turns.
 */
export function toProviderTurns(messages: readonly Message[]): ProviderTurn[] {
  const turns: ProviderTurn[] = [];

  for (const message of messages) {
    if (isAssistantMessage(message) && message.status === "failed") continue;
    if (message.text.trim().length === 0) continue;
    turns.push({ role: message.role, content: message.text });
  }

  return turns;
}
