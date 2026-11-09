import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Conversation } from "@/domain/conversation.ts";

/*
 * The store is tested through its own interface: the exported actions and
 * selectors. Only persistence and the typing pace are replaced, each at its seam —
 * IndexedDB is absent in jsdom, and real pauses would only slow the suite. Replies come from the real built-in rules
 * provider, which needs nothing from the device.
 */
const db = vi.hoisted(() => ({
  loadConversations: vi.fn<() => Promise<Conversation[]>>(() => Promise.resolve([])),
  saveConversation: vi.fn<(conversation: Conversation) => Promise<void>>(() =>
    Promise.resolve(),
  ),
  deleteConversationRow: vi.fn<(id: string) => Promise<void>>(() => Promise.resolve()),
  pruneConversations: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/db/conversations.ts", () => db);

// The rules provider paces its replies like typing; tests do not need to wait.
vi.mock("@/lib/sleep.ts", () => ({ sleep: () => Promise.resolve() }));

const {
  deleteConversation,
  editMessage,
  newConversation,
  renameConversation,
  restoreConversation,
  retryLastReply,
  selectActiveConversation,
  selectThreadList,
  sendMessage,
  togglePinned,
  useChat,
} = await import("../chat.ts");

function blank(id: string): Conversation {
  return { id, title: "New chat", createdAt: 1, updatedAt: 1, messages: [] };
}

function active(): Conversation {
  return selectActiveConversation(useChat.getState());
}

beforeEach(() => {
  vi.clearAllMocks();
  useChat.setState({
    conversations: [blank("start")],
    activeId: "start",
    isGenerating: false,
    activeProvider: undefined,
  });
});

describe("sendMessage", () => {
  it("appends the message and a completed reply, and titles the thread", async () => {
    await sendMessage("  hello  ");

    const [user, reply] = active().messages;
    expect(user).toMatchObject({ role: "user", text: "hello" });
    expect(reply).toMatchObject({
      role: "assistant",
      source: "rules",
      status: "complete",
    });
    expect(reply?.text.length).toBeGreaterThan(0);
    expect(active().title).toBe("hello");
    expect(useChat.getState().isGenerating).toBe(false);
  });

  it("persists the settled turn", async () => {
    await sendMessage("hello");

    const saved = db.saveConversation.mock.calls.at(-1)?.[0];
    expect(saved?.messages.at(-1)).toMatchObject({ status: "complete" });
  });

  it("ignores blank input", async () => {
    await sendMessage("   ");

    expect(active().messages).toHaveLength(0);
  });
});

describe("retryLastReply", () => {
  it("replaces the last reply instead of adding another", async () => {
    await sendMessage("hello");
    const firstReplyId = active().messages[1]?.id;

    await retryLastReply();

    expect(active().messages).toHaveLength(2);
    expect(active().messages[1]?.id).not.toBe(firstReplyId);
  });
});

describe("editMessage", () => {
  it("rewrites the message, drops what followed, and regenerates", async () => {
    await sendMessage("hello");
    await sendMessage("tell me a joke");
    const first = active().messages[0];
    if (!first) throw new Error("expected a first message");

    await editMessage(first.id, "my name is Ana");

    const messages = active().messages;
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ id: first.id, text: "my name is Ana" });
    expect(messages[1]).toMatchObject({ role: "assistant", status: "complete" });
    expect(messages[1]?.text).toContain("Ana");
  });

  it("retitles the thread when its first message changes", async () => {
    await sendMessage("hello");
    const first = active().messages[0];
    if (!first) throw new Error("expected a first message");

    await editMessage(first.id, "plans for the weekend");

    expect(active().title).toBe("plans for the weekend");
  });
});

describe("newConversation", () => {
  it("reuses an untouched thread rather than stacking blank ones", () => {
    newConversation();
    newConversation();

    expect(useChat.getState().conversations).toHaveLength(1);
    expect(useChat.getState().activeId).toBe("start");
  });

  it("starts a fresh thread once the current one has messages", async () => {
    await sendMessage("hello");
    newConversation();

    expect(useChat.getState().conversations).toHaveLength(2);
    expect(active().messages).toHaveLength(0);
  });
});

describe("delete and restore", () => {
  it("returns the deleted thread so it can be restored", async () => {
    await sendMessage("hello");
    const id = useChat.getState().activeId;

    const removed = deleteConversation(id);

    expect(removed?.id).toBe(id);
    expect(db.deleteConversationRow).toHaveBeenCalledWith(id);
    expect(useChat.getState().conversations.some((thread) => thread.id === id)).toBe(
      false,
    );

    if (!removed) throw new Error("expected a removed thread");
    restoreConversation(removed);

    expect(useChat.getState().activeId).toBe(id);
    expect(active().messages).toHaveLength(2);
    expect(db.saveConversation).toHaveBeenLastCalledWith(removed);
  });

  it("drops the blank thread created only because the list emptied", async () => {
    await sendMessage("hello");
    const removed = deleteConversation(useChat.getState().activeId);
    if (!removed) throw new Error("expected a removed thread");

    restoreConversation(removed);

    expect(useChat.getState().conversations).toEqual([removed]);
  });
});

describe("rename and pin", () => {
  it("renames without moving the thread in the list", async () => {
    await sendMessage("hello");
    const { id, updatedAt } = active();

    renameConversation(id, "  Greetings  ");

    expect(active()).toMatchObject({ title: "Greetings", updatedAt });
  });

  it("ignores a blank name", async () => {
    await sendMessage("hello");
    renameConversation(active().id, "   ");

    expect(active().title).toBe("hello");
  });

  it("pins and unpins, omitting the flag when off", async () => {
    await sendMessage("hello");
    const { id } = active();

    togglePinned(id);
    expect(active().pinned).toBe(true);
    expect(selectThreadList(useChat.getState())[0]?.pinned).toBe(true);

    togglePinned(id);
    expect("pinned" in active()).toBe(false);
  });
});

describe("selectThreadList", () => {
  it("lists only threads with messages, most recent first", () => {
    useChat.setState({
      conversations: [
        { ...blank("old"), title: "Old", updatedAt: 1, messages: [message("a")] },
        blank("empty"),
        { ...blank("new"), title: "New", updatedAt: 5, messages: [message("b")] },
      ],
    });

    expect(selectThreadList(useChat.getState()).map((thread) => thread.id)).toEqual([
      "new",
      "old",
    ]);
  });

  it("keeps its reference while only message text changes, as when streaming", () => {
    const thread = {
      ...blank("t"),
      title: "T",
      updatedAt: 3,
      messages: [message("a")],
    };
    useChat.setState({ conversations: [thread] });
    const before = selectThreadList(useChat.getState());

    useChat.setState({
      conversations: [{ ...thread, messages: [message("a", "streamed more text")] }],
    });

    expect(selectThreadList(useChat.getState())).toBe(before);
  });
});

function message(id: string, text = "hi") {
  return { id, role: "user" as const, text, createdAt: 1 };
}
