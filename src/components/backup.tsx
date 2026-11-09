import { Download, FileText, Upload } from "lucide-react";
import { type ChangeEvent, type ReactNode, useRef, useState } from "react";

import { fileName, fromBackup, toBackup, toMarkdown } from "@/db/transfer.ts";
import { download } from "@/lib/download.ts";
import {
  importConversations,
  selectActiveConversation,
  useChat,
} from "@/stores/chat.ts";

function handleExportAll() {
  const { conversations } = useChat.getState();
  const date = new Date().toISOString().slice(0, 10);
  download(`chat-buddy-${date}.json`, toBackup(conversations), "application/json");
}

function handleExportCurrent() {
  const conversation = selectActiveConversation(useChat.getState());
  download(
    fileName(conversation.title, "md"),
    toMarkdown(conversation),
    "text/markdown",
  );
}

/**
 * Export and import, so chats are never trapped in one browser: a JSON backup of
 * every thread, a Markdown copy of the current one, and import from a backup.
 */
function BackupTools() {
  const hasCurrent = useChat(
    (state) => selectActiveConversation(state).messages.length > 0,
  );
  const hasAny = useChat((state) =>
    state.conversations.some((thread) => thread.messages.length > 0),
  );
  const [status, setStatus] = useState<string | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChooseFile = () => {
    inputRef.current?.click();
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const result = fromBackup(await file.text());
    if (!result.ok) {
      setStatus(result.error);
      return;
    }

    const added = importConversations(result.conversations);
    const skipped = result.skipped > 0 ? ` ${result.skipped} couldn't be read.` : "";
    setStatus(
      added === 0
        ? `Nothing new to import — you already have these chats.${skipped}`
        : `Imported ${added} chat${added === 1 ? "" : "s"}.${skipped}`,
    );
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    void handleFile(event);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <ToolButton onClick={handleExportAll} isDisabled={!hasAny}>
          <Download size={14} aria-hidden />
          Back up all
        </ToolButton>
        <ToolButton
          onClick={handleExportCurrent}
          isDisabled={!hasCurrent}
          title="Download this chat as Markdown"
        >
          <FileText size={14} aria-hidden />
          Export chat
        </ToolButton>
        <ToolButton onClick={handleChooseFile}>
          <Upload size={14} aria-hidden />
          Import
        </ToolButton>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleFileChange}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
      />

      <p role="status" className="min-h-lh text-xs text-content-muted">
        {status}
      </p>
    </div>
  );
}

function ToolButton({
  onClick,
  isDisabled = false,
  title,
  children,
}: {
  readonly onClick: () => void;
  readonly isDisabled?: boolean;
  readonly title?: string;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={isDisabled}
      className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border-subtle bg-surface px-3 text-sm whitespace-nowrap text-content transition-colors hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:h-11"
    >
      {children}
    </button>
  );
}

export { BackupTools };
