import { describe, expect, it } from "vitest";
import { deriveTitle, NEW_CONVERSATION_TITLE } from "@/domain/conversation.ts";
import type { AssistantMessage, Message, UserMessage } from "@/domain/message.ts";
import { toProviderTurns } from "@/domain/message.ts";

function user(text: string): UserMessage {
  return { id: `u-${text}`, role: "user", text, createdAt: 0 };
}

function assistant(
  text: string,
  status: AssistantMessage["status"] = "complete",
): AssistantMessage {
  return {
    id: `a-${text}-${status}`,
    role: "assistant",
    text,
    createdAt: 0,
    source: "rules",
    status,
    attachments: [],
  };
}

describe("deriveTitle", () => {
  it("uses the first user message", () => {
    expect(deriveTitle([assistant("hello"), user("What is WebGPU?")])).toBe(
      "What is WebGPU?",
    );
  });

  it("falls back when there is no user message", () => {
    expect(deriveTitle([])).toBe(NEW_CONVERSATION_TITLE);
    expect(deriveTitle([assistant("hi")])).toBe(NEW_CONVERSATION_TITLE);
  });

  it("collapses whitespace and newlines", () => {
    expect(deriveTitle([user("what\n\n  is   this")])).toBe("what is this");
  });

  it("falls back for a whitespace-only message", () => {
    expect(deriveTitle([user("   \n ")])).toBe(NEW_CONVERSATION_TITLE);
  });

  it("truncates long titles without splitting a word", () => {
    const source =
      "Please explain the entire history of browser inference engines to me";
    const title = deriveTitle([user(source)]);

    expect(title.endsWith("…")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(49);

    // The kept portion must be a whole-word prefix of the source: the source
    // either ends there, or continues with a space.
    const body = title.slice(0, -1);
    expect(source.startsWith(body)).toBe(true);
    expect(source[body.length]).toBe(" ");
  });

  it("does not truncate a title that already fits", () => {
    expect(deriveTitle([user("Short enough")])).toBe("Short enough");
  });
});

describe("toProviderTurns", () => {
  it("projects role and content only", () => {
    const messages: Message[] = [user("hi"), assistant("hello")];

    expect(toProviderTurns(messages)).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
  });

  it("drops failed generations so the model never sees an error as its own turn", () => {
    const messages: Message[] = [user("hi"), assistant("boom", "failed")];
    expect(toProviderTurns(messages)).toEqual([{ role: "user", content: "hi" }]);
  });

  it("drops blank turns, including a streaming placeholder", () => {
    const messages: Message[] = [user("hi"), assistant("", "streaming")];
    expect(toProviderTurns(messages)).toEqual([{ role: "user", content: "hi" }]);
  });

  it("keeps a stopped reply, since its partial text is real context", () => {
    const messages: Message[] = [user("hi"), assistant("partial", "stopped")];
    expect(toProviderTurns(messages)).toHaveLength(2);
  });
});
