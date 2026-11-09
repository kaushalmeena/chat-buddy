import {
  Ellipsis,
  type LucideIcon,
  MessageSquare,
  PencilLine,
  Pin,
  PinOff,
  Search,
  Trash2,
} from "lucide-react";
import {
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  deleteConversation,
  renameConversation,
  selectConversation,
  selectThreadList,
  type ThreadSummary,
  togglePinned,
  useChat,
} from "@/stores/chat.ts";
import { closeDrawer, offerUndo } from "@/stores/ui.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

type ThreadGroup = {
  readonly label: string;
  readonly threads: readonly ThreadSummary[];
};

/** Buckets threads the way people remember them: by how long ago they were used. */
function groupThreads(threads: readonly ThreadSummary[], now: number): ThreadGroup[] {
  const pinned = threads.filter((thread) => thread.pinned);
  const rest = groupByRecency(
    threads.filter((thread) => !thread.pinned),
    now,
  );
  return pinned.length > 0 ? [{ label: "Pinned", threads: pinned }, ...rest] : rest;
}

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
    () => groupThreads(searchThreads(threads, deferredQuery), now),
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
  const [isRenaming, setIsRenaming] = useState(false);

  const handleSelect = () => {
    selectConversation(thread.id);
    closeDrawer();
  };

  const handleRename = () => {
    setIsRenaming(true);
  };

  const handleRenameDone = () => {
    setIsRenaming(false);
  };

  if (isRenaming) return <RenameField thread={thread} onDone={handleRenameDone} />;

  return (
    <li className="group relative">
      <button
        type="button"
        onClick={handleSelect}
        onDoubleClick={handleRename}
        aria-current={isActive ? "page" : undefined}
        className={`relative flex h-9 w-full items-center gap-1.5 truncate rounded-lg pr-9 pl-2.5 text-left text-sm transition-colors pointer-coarse:h-11 ${
          isActive
            ? "bg-surface font-medium text-content shadow-card"
            : "text-content-muted hover:bg-surface/70 hover:text-content"
        }`}
      >
        <span className="truncate">{thread.title}</span>
      </button>

      <ThreadMenu thread={thread} onRename={handleRename} />
    </li>
  );
}

function selectAll(event: FocusEvent<HTMLInputElement>) {
  event.target.select();
}

/** Rename in place: Enter or leaving the field saves, Escape cancels. */
function RenameField({
  thread,
  onDone,
}: {
  readonly thread: ThreadSummary;
  readonly onDone: () => void;
}) {
  const [draft, setDraft] = useState(thread.title);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDraft(event.target.value);
  };

  const handleSave = () => {
    renameConversation(thread.id, draft);
    onDone();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") handleSave();
    if (event.key === "Escape") onDone();
  };

  return (
    <li>
      <label className="sr-only" htmlFor={`rename-${thread.id}`}>
        Chat name
      </label>
      <input
        id={`rename-${thread.id}`}
        value={draft}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleSave}
        onFocus={selectAll}
        maxLength={80}
        autoFocus
        className="h-9 w-full rounded-lg border border-brand-400 bg-surface px-2.5 text-sm text-content outline-none pointer-coarse:h-11"
      />
    </li>
  );
}

/**
 * The "⋯" menu: pin, rename, delete. A small disclosure rather than three hover
 * buttons, so a row never loses its title to controls. Closes on Escape, on a
 * click outside, and after any action.
 */
function ThreadMenu({
  thread,
  onRename,
}: {
  readonly thread: ThreadSummary;
  readonly onRename: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = `thread-menu-${thread.id}`;

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (!rootRef.current?.contains(target)) setIsOpen(false);
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleToggle = () => {
    setIsOpen((open) => !open);
  };

  const handlePin = () => {
    setIsOpen(false);
    togglePinned(thread.id);
  };

  const handleRename = () => {
    setIsOpen(false);
    onRename();
  };

  const handleDelete = () => {
    setIsOpen(false);
    const removed = deleteConversation(thread.id);
    if (removed) offerUndo(removed);
  };

  return (
    <div ref={rootRef} className="absolute top-1/2 right-1 -translate-y-1/2">
      <button
        type="button"
        onClick={handleToggle}
        aria-label={`Options for "${thread.title}"`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        // Hidden until hover or focus so the list stays calm; always on touch.
        className={`grid size-7 place-items-center rounded-md text-content-faint transition-opacity hover:bg-surface-raised hover:text-content focus-visible:opacity-100 pointer-coarse:size-11 pointer-coarse:opacity-100 ${
          isOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <Ellipsis size={15} aria-hidden />
      </button>

      {isOpen && (
        <div
          id={menuId}
          role="menu"
          aria-label={`Options for "${thread.title}"`}
          className="absolute top-full right-0 z-20 mt-1 w-40 animate-pop rounded-xl border border-border-subtle bg-surface p-1 shadow-float"
        >
          <MenuItem
            icon={thread.pinned ? PinOff : Pin}
            label={thread.pinned ? "Unpin" : "Pin"}
            onSelect={handlePin}
          />
          <MenuItem icon={PencilLine} label="Rename" onSelect={handleRename} />
          <MenuItem icon={Trash2} label="Delete" onSelect={handleDelete} isDanger />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onSelect,
  isDanger = false,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly onSelect: () => void;
  readonly isDanger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className={`flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-sm transition-colors pointer-coarse:h-11 ${
        isDanger
          ? "text-danger hover:bg-danger/10"
          : "text-content hover:bg-surface-raised"
      }`}
    >
      <Icon size={14} aria-hidden />
      {label}
    </button>
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
