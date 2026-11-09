import { Check, Copy, Pencil, RefreshCw, TriangleAlert } from "lucide-react";
import {
  type ChangeEvent,
  type KeyboardEvent,
  memo,
  type ReactNode,
  useState,
} from "react";

import type { AssistantMessage, Message, UserMessage } from "@/domain/message.ts";
import { editMessage, retryLastReply, useChat } from "@/stores/chat.ts";

import { BrandMark } from "./logo.tsx";
import { RichText } from "./prose.tsx";
import { StreamingMarkdown } from "./stream.tsx";

const SOURCE_LABELS: Record<AssistantMessage["source"], string> = {
  "prompt-api": "Chrome built-in AI",
  "web-llm": "Local model",
  rules: "Built-in rules",
};

const COPY_FEEDBACK_MS = 1600;

type MessageBubbleProps = {
  readonly message: Message;
  /** Enables the retry affordance and keeps the actions visible, on the final reply. */
  readonly isLast: boolean;
};

/**
 * Memoised so a streaming reply re-renders only its own bubble. Without this, every
 * committed slice would re-render the entire transcript.
 */
const MessageBubble = memo(function MessageBubble({
  message,
  isLast,
}: MessageBubbleProps) {
  return message.role === "user" ? (
    <UserBubble message={message} />
  ) : (
    <AssistantMessageRow message={message} isLast={isLast} />
  );
});

function UserBubble({ message }: { readonly message: UserMessage }) {
  const [isEditing, setIsEditing] = useState(false);
  const isGenerating = useChat((state) => state.isGenerating);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleDone = () => {
    setIsEditing(false);
  };

  if (isEditing) return <EditForm message={message} onDone={handleDone} />;

  return (
    <li className="group flex animate-enter flex-col items-end gap-1">
      <div className="max-w-[min(36rem,85%)] rounded-bubble rounded-br-md bg-brand-500/12 px-4 py-2.5 text-content">
        <p className="text-base leading-relaxed wrap-break-word whitespace-pre-wrap">
          {message.text}
        </p>
      </div>
      {/* Hover-revealed on pointers, always shown on touch; space is reserved either way. */}
      <div className="flex h-7 items-center text-xs text-content-faint transition-opacity group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:h-10 pointer-fine:opacity-0">
        <ActionButton
          label="Edit message"
          onClick={handleEdit}
          isDisabled={isGenerating}
        >
          <Pencil size={13} aria-hidden />
        </ActionButton>
      </div>
    </li>
  );
}

/**
 * Edits a sent message in place. Saving rewrites it and regenerates the reply;
 * everything after it in the thread is replaced.
 */
function EditForm({
  message,
  onDone,
}: {
  readonly message: UserMessage;
  readonly onDone: () => void;
}) {
  const [draft, setDraft] = useState(message.text);
  const canSave = draft.trim().length > 0 && draft.trim() !== message.text;

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(event.target.value);
  };

  const handleSave = () => {
    if (!canSave) return;
    onDone();
    void editMessage(message.id, draft);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onDone();
    }
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      handleSave();
    }
  };

  return (
    <li className="flex justify-end">
      <div className="flex w-full max-w-[min(36rem,100%)] flex-col gap-2 rounded-bubble border border-brand-400 bg-surface p-3 shadow-card">
        <label className="sr-only" htmlFor={`edit-${message.id}`}>
          Edit message
        </label>
        <textarea
          id={`edit-${message.id}`}
          value={draft}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          rows={Math.min(8, draft.split("\n").length + 1)}
          autoFocus
          className="scrollbar-slim w-full resize-none bg-transparent text-base leading-relaxed text-content outline-none"
        />
        <div className="flex items-center justify-end gap-2">
          <span className="mr-auto text-xs text-content-faint">
            Replies after this message will be replaced.
          </span>
          <button
            type="button"
            onClick={onDone}
            className="h-8 rounded-lg px-3 text-sm text-content-muted transition-colors hover:bg-surface-raised hover:text-content pointer-coarse:h-11"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="h-8 rounded-lg bg-brand-600 px-3 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40 pointer-coarse:h-11"
          >
            Save & send
          </button>
        </div>
      </div>
    </li>
  );
}

/**
 * Assistant replies sit on the canvas rather than in a bubble, beside the brand
 * mark: long, formatted answers read better at full measure than boxed in, and the
 * avatar is what marks the speaker.
 */
function AssistantMessageRow({
  message,
  isLast,
}: {
  readonly message: AssistantMessage;
  readonly isLast: boolean;
}) {
  const isStreaming = message.status === "streaming";
  const hasFailed = message.status === "failed";

  return (
    <li className="group flex animate-enter gap-3">
      <BrandMark size={28} className="mt-0.5 shrink-0 rounded-lg shadow-card" />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {hasFailed ? (
          <p className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/5 px-3.5 py-2.5 text-base text-danger">
            <TriangleAlert size={17} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              {message.error ?? "Couldn't finish this reply. Use Retry to try again."}
            </span>
          </p>
        ) : (
          /*
           * No caret: text arriving at a steady pace is itself the signal that
           * generation is in progress. Streaming replies are paced at frame rate by
           * StreamingMarkdown; settled ones render directly, so history never
           * re-animates on mount.
           *
           * The typing dots live inside the same container as the text and are one
           * line tall, and they stay until there is *visible* text — not merely text
           * in the store, which the reveal holds back for a few frames. Swapping on
           * the store's text left an empty, zero-height reply for a frame or two,
           * and the whole transcript jumped.
           */
          <div className="message-prose min-h-[calc(1lh+0.125rem)] pt-0.5 text-base/relaxed text-content">
            {isStreaming ? (
              <StreamingMarkdown
                text={message.text}
                isStreaming
                placeholder={<TypingDots />}
              />
            ) : (
              <RichText text={message.text} />
            )}
          </div>
        )}

        {/*
         * Rendered while streaming too, just invisible, so the row's height is
         * reserved from the first token and the actions appear without a shift.
         */}
        <MessageActions message={message} isLast={isLast} isHidden={isStreaming} />
      </div>
    </li>
  );
}

function handleRetry() {
  void retryLastReply();
}

function MessageActions({
  message,
  isLast,
  isHidden,
}: {
  readonly message: AssistantMessage;
  readonly isLast: boolean;
  readonly isHidden: boolean;
}) {
  const canCopy = message.text.trim().length > 0;

  return (
    <div
      inert={isHidden}
      className={`flex h-7 items-center gap-0.5 text-xs text-content-faint transition-opacity group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:h-10 ${
        isHidden ? "invisible" : ""
      } ${isLast ? "" : "pointer-fine:opacity-0"}`}
    >
      {canCopy && <CopyButton text={message.text} />}

      {isLast && (
        <ActionButton label="Retry" onClick={handleRetry}>
          <RefreshCw size={13} aria-hidden />
        </ActionButton>
      )}

      <span className="ml-1.5">
        {SOURCE_LABELS[message.source]}
        {message.status === "stopped" && " · stopped"}
      </span>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  isDisabled = false,
  children,
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly isDisabled?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      aria-label={label}
      title={label}
      className="grid size-7 place-items-center rounded-md transition-colors hover:bg-surface-raised hover:text-content disabled:cursor-not-allowed disabled:opacity-40 pointer-coarse:size-10"
    >
      {children}
    </button>
  );
}

function CopyButton({ text }: { readonly text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch {
      // Clipboard permission denied; nothing useful to show for a copy button.
    }
  };

  const handleClick = () => {
    void handleCopy();
  };

  return (
    <ActionButton label={copied ? "Copied" : "Copy"} onClick={handleClick}>
      {copied ? (
        <Check size={13} className="text-success" aria-hidden />
      ) : (
        <Copy size={13} aria-hidden />
      )}
    </ActionButton>
  );
}

const DOT_DELAYS = ["0s", "0.16s", "0.32s"] as const;

function TypingDots() {
  return (
    // The dots are decorative; the status text is what a screen reader announces.
    // Exactly one line of message text (`1lh` is the computed line-height), so the
    // first line replaces it without changing the row's height.
    <div className="flex h-lh items-center gap-1" role="status">
      <span className="sr-only">Chat Buddy is typing</span>
      {DOT_DELAYS.map((delay) => (
        <span
          key={delay}
          aria-hidden
          className="size-1.5 animate-pulse-dot rounded-full bg-brand-500"
          style={{ animationDelay: delay }}
        />
      ))}
    </div>
  );
}

export { MessageBubble };
