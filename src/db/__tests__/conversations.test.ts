import { describe, expect, it } from "vitest";
import { isConversation, normalise } from "@/db/conversations.ts";
import type { Conversation } from "@/domain/conversation.ts";

function thread(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "c1",
    title: "A chat",
    createdAt: 1,
    updatedAt: 2,
    messages: [{ id: "m1", role: "user", text: "hi", createdAt: 1 }],
    ...overrides,
  };
}

/*
 * The Dexie read and write paths are exercised against a real browser IndexedDB
 * rather than a fake one, so what is unit-tested here is the part that guards the
 * domain model: validation of untrusted rows, and repair of states that cannot
 * exist at rest.
 */

describe("isConversation", () => {
  it("accepts a well-formed thread", () => {
    expect(isConversation(thread())).toBe(true);
  });

  it("accepts a thread with no messages", () => {
    expect(isConversation(thread({ messages: [] }))).toBe(true);
  });

  it("rejects non-objects", () => {
    for (const value of [null, undefined, 42, "conversation", []]) {
      expect(isConversation(value)).toBe(false);
    }
  });

  it("rejects a missing or mistyped field", () => {
    expect(isConversation({ ...thread(), id: 7 })).toBe(false);
    expect(isConversation({ ...thread(), updatedAt: "recently" })).toBe(false);
    expect(isConversation({ ...thread(), messages: "none" })).toBe(false);
  });

  it("rejects a thread containing a malformed message", () => {
    expect(
      isConversation({ ...thread(), messages: [{ id: "m1", role: "user" }] }),
    ).toBe(false);
  });

  it("rejects an assistant message missing its assistant-only fields", () => {
    const message = { id: "a1", role: "assistant", text: "hi", createdAt: 1 };
    expect(isConversation({ ...thread(), messages: [message] })).toBe(false);
  });

  it("accepts a well-formed assistant message", () => {
    const message = {
      id: "a1",
      role: "assistant",
      text: "hi",
      createdAt: 1,
      source: "rules",
      status: "complete",
      attachments: [],
    };
    expect(isConversation({ ...thread(), messages: [message] })).toBe(true);
  });

  it("rejects an unknown role", () => {
    const message = { id: "x", role: "system", text: "hi", createdAt: 1 };
    expect(isConversation({ ...thread(), messages: [message] })).toBe(false);
  });
});

describe("normalise", () => {
  const streaming = {
    id: "a1",
    role: "assistant" as const,
    text: "half a th",
    createdAt: 1,
    source: "web-llm" as const,
    status: "streaming" as const,
    attachments: [],
  };

  it("rewrites a message left mid-stream as stopped, keeping its text", () => {
    // A tab closed during generation persists a `streaming` message; restoring it
    // as-is would leave the UI waiting on a stream that no longer exists.
    const [message] = normalise(thread({ messages: [streaming] })).messages;

    expect(message && "status" in message && message.status).toBe("stopped");
    expect(message?.text).toBe("half a th");
  });

  it("returns the same object when nothing needs repair", () => {
    // Identity matters: a fresh object per load would defeat downstream memoisation.
    const input = thread();
    expect(normalise(input)).toBe(input);
  });

  it("leaves settled statuses alone", () => {
    const settled = { ...streaming, status: "complete" as const };
    const [message] = normalise(thread({ messages: [settled] })).messages;
    expect(message && "status" in message && message.status).toBe("complete");
  });
});
