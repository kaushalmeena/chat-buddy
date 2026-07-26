import { beforeEach, describe, expect, it } from "vitest";
import type { Conversation } from "@/domain/conversation.ts";
import { loadConversations, saveConversations } from "./persistence.ts";

const STORAGE_KEY = "chat-buddy:threads";

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

describe("thread persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips a conversation", () => {
    const original = thread();
    saveConversations([original]);
    expect(loadConversations()).toEqual([original]);
  });

  it("returns nothing when storage is empty", () => {
    expect(loadConversations()).toEqual([]);
  });

  it("discards unparseable data rather than throwing", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(loadConversations()).toEqual([]);
  });

  it("discards data written by a different schema version", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 999, conversations: [thread()] }),
    );
    expect(loadConversations()).toEqual([]);
  });

  it("drops conversations whose shape does not validate", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        conversations: [thread(), { id: "bad", title: "no messages array" }],
      }),
    );

    expect(loadConversations()).toHaveLength(1);
  });

  it("drops a conversation containing a malformed message", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        conversations: [
          { ...thread(), messages: [{ id: "m1", role: "user" /* no text */ }] },
        ],
      }),
    );

    expect(loadConversations()).toEqual([]);
  });

  it("rewrites a message left mid-stream as stopped", () => {
    // A tab closed during generation persists a `streaming` message; reloading it
    // as-is would leave a caret blinking forever with nothing driving it.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        conversations: [
          {
            ...thread(),
            messages: [
              {
                id: "a1",
                role: "assistant",
                text: "half a th",
                createdAt: 1,
                source: "web-llm",
                status: "streaming",
                attachments: [],
              },
            ],
          },
        ],
      }),
    );

    const [restored] = loadConversations();
    const message = restored?.messages[0];

    expect(message && "status" in message && message.status).toBe("stopped");
    expect(message?.text).toBe("half a th");
  });

  it("keeps the most recently updated threads when over the cap", () => {
    const many = Array.from({ length: 60 }, (_, index) =>
      thread({ id: `c${index}`, updatedAt: index }),
    );

    saveConversations(many);
    const restored = loadConversations();

    expect(restored).toHaveLength(50);
    expect(restored[0]?.id).toBe("c59");
    expect(restored.some((item) => item.id === "c0")).toBe(false);
  });
});
