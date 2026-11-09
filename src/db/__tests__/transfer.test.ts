import { describe, expect, it } from "vitest";

import { fileName, fromBackup, toBackup, toMarkdown } from "@/db/transfer.ts";
import type { Conversation } from "@/domain/conversation.ts";

const thread: Conversation = {
  id: "c1",
  title: "Trip plans",
  createdAt: 1,
  updatedAt: 2,
  messages: [
    { id: "m1", role: "user", text: "Where should I go?", createdAt: 1 },
    {
      id: "m2",
      role: "assistant",
      text: "Somewhere warm.",
      createdAt: 2,
      source: "rules",
      status: "complete",
      attachments: [],
    },
  ],
};

describe("backup", () => {
  it("round-trips threads exactly", () => {
    const result = fromBackup(toBackup([thread]));
    expect(result).toEqual({ ok: true, conversations: [thread], skipped: 0 });
  });

  it("leaves empty threads out of a backup", () => {
    const empty = { ...thread, id: "c2", messages: [] };
    const result = fromBackup(toBackup([thread, empty]));
    expect(result.ok && result.conversations.map((item) => item.id)).toEqual(["c1"]);
  });

  it("accepts a bare array and skips invalid entries", () => {
    const result = fromBackup(JSON.stringify([thread, { id: 3 }]));
    expect(result).toMatchObject({ ok: true, skipped: 1 });
  });

  it("repairs a thread saved mid-reply", () => {
    const streaming = {
      ...thread,
      messages: [{ ...thread.messages[1], status: "streaming" }],
    };
    const result = fromBackup(JSON.stringify([streaming]));
    expect(result.ok && result.conversations[0]?.messages[0]).toMatchObject({
      status: "stopped",
    });
  });

  it.each([
    ["not json", "isn't valid JSON"],
    ['{"hello": 1}', "doesn't look like"],
  ])("rejects %j", (text, message) => {
    const result = fromBackup(text);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain(message);
  });
});

describe("toMarkdown", () => {
  it("writes a readable transcript", () => {
    expect(toMarkdown(thread)).toBe(
      "# Trip plans\n\n**You:**\n\nWhere should I go?\n\n**Chat Buddy:**\n\nSomewhere warm.\n",
    );
  });
});

describe("fileName", () => {
  it("slugs titles safely", () => {
    expect(fileName("What's up? / plans!", "md")).toBe("what-s-up-plans.md");
    expect(fileName("???", "json")).toBe("chat.json");
  });
});
