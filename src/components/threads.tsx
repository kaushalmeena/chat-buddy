import { MessageSquare, Search, Trash2 } from "lucide-react";
import { type ChangeEvent, useDeferredValue, useMemo, useState } from "react";

import {
  deleteConversation,
  selectConversation,
  selectThreadList,
  type ThreadSummary,
  useChat,
} from "@/stores/chat.ts";
import { closeDrawer, offerUndo } from "@/stores/ui.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

type ThreadGroup = {
  readonly label: string;
  readonly threads: readonly ThreadSummary[];
};

/** Buckets threads the way people remember them: by how long ago they were used. */
function groupByRecency(threads: readonly ThreadSummary[], now: number): ThreadGroup[] {
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const buckets: { label: string; since: number; threads: ThreadSummary[] }[] = [
    { label: "Today", since: startOfToday, threads: [] },
    { label: "Yesterday", since: startOfToday - DAY_MS, threads: [] },
    { label: "Previous 7 days", since: startOfToday - 7 * DAY_MS, threads: [] },
    { label: "Previous 30 days", since: startOfToday - 30 * DAY_MS, threads: [] },
    { label: "Older", since: Number.NEGATIVE_INFINITY, threads: [] },
  ];

  for (const thread of threads) {
    const bucket = buckets.find((candidate) => thread.updatedAt >= candidate.since);
    bucket?.threads.push(thread);
  }

  return buckets.filter((bucket) => bucket.threads.length > 0);
}

/**
 * Threads whose title or any message contains the query. Message text is read from
 * the store at search time rather than subscribed to, so streaming never re-runs it.
 */
function searchThreads(
  threads: readonly ThreadSummary[],
  query: string,
): readonly ThreadSummary[] {
  if (query === "") return threads;

  const byId = new Map(
    useChat
      .getState()
      .conversations.map((conversation) => [conversation.id, conversation]),
  );

  return threads.filter((thread) => {
    if (thread.title.toLowerCase().includes(query)) return true;
    const messages = byId.get(thread.id)?.messages ?? [];
    return messages.some((message) => message.text.toLowerCase().includes(query));
  });
}

function ThreadList() {
  const threads = useChat(selectThreadList);
  const [query, setQuery] = useState("");
  // Captured once per mount: grouping only needs day precision.
  const [now] = useState(Date.now);
  // Searching walks every message; deferring keeps typing responsive on long histories.
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const groups = useMemo(
    () => groupByRecency(searchThreads(threads, deferredQuery), now),
    [threads, deferredQuery, now],
  );

  const handleQueryChange = (event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
  };

  return (
    <div className="flex h-full flex-col gap-2">
      <label className="relative block">
        <span className="sr-only">Search chats</span>
        <Search
          size={14}
          className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-content-faint"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={handleQueryChange}
          placeholder="Search chats"
          className="h-8 w-full rounded-lg border border-transparent bg-surface-raised pr-2 pl-8 text-sm text-content transition-colors outline-none placeholder:text-content-faint hover:border-border-subtle focus:border-brand-400 focus:bg-surface"
        />
      </label>

      <nav
        aria-label="Conversations"
        className="scrollbar-slim -mx-1 flex-1 overflow-y-auto px-1"
      >
        {groups.length === 0 ? (
          <EmptyList isSearching={deferredQuery !== ""} />
        ) : (
          groups.map((group) => <ThreadSection key={group.label} group={group} />)
        )}
      </nav>
    </div>
  );
}

function ThreadSection({ group }: { readonly group: ThreadGroup }) {
  return (
    <section className="pb-3">
      <h2 className="px-2.5 pt-2 pb-1 text-xs font-medium text-content-faint">
        {group.label}
      </h2>
      <ul className="flex flex-col gap-px">
        {group.threads.map((thread) => (
          <ThreadItem key={thread.id} thread={thread} />
        ))}
      </ul>
    </section>
  );
}

function ThreadItem({ thread }: { readonly thread: ThreadSummary }) {
  const isActive = useChat((state) => state.activeId === thread.id);

  const handleSelect = () => {
    selectConversation(thread.id);
    closeDrawer();
  };

  const handleDelete = () => {
    const removed = deleteConversation(thread.id);
    if (removed) offerUndo(removed);
  };

  return (
    <li className="group relative">
      <button
        type="button"
        onClick={handleSelect}
        aria-current={isActive ? "page" : undefined}
        className={`relative flex h-9 w-full items-center truncate rounded-lg pr-9 pl-2.5 text-left text-sm transition-colors pointer-coarse:h-11 ${
          isActive
            ? "bg-surface font-medium text-content shadow-card"
            : "text-content-muted hover:bg-surface/70 hover:text-content"
        }`}
      >
        <span className="truncate">{thread.title}</span>
      </button>

      <button
        type="button"
        onClick={handleDelete}
        aria-label={`Delete "${thread.title}"`}
        title="Delete chat"
        // Hidden until hover or keyboard focus, so the list stays calm without
        // making deletion keyboard-inaccessible.
        className="absolute top-1/2 right-1 grid size-7 -translate-y-1/2 place-items-center rounded-md text-content-faint opacity-0 transition-opacity group-hover:opacity-100 hover:bg-danger/10 hover:text-danger focus-visible:opacity-100 pointer-coarse:size-11 pointer-coarse:opacity-100"
      >
        <Trash2 size={14} aria-hidden />
      </button>
    </li>
  );
}

function EmptyList({ isSearching }: { readonly isSearching: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-content-faint">
      <MessageSquare size={20} aria-hidden />
      <p className="text-xs">
        {isSearching ? "No chats match that search." : "Your chats will appear here."}
      </p>
    </div>
  );
}

export { ThreadList };
