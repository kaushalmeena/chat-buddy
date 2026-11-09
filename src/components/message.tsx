import { Check, Copy, Pencil, RefreshCw, TriangleAlert } from "lucide-react";
import {
  type ChangeEvent,
  type KeyboardEvent,
  memo,
  type ReactNode,
  useLayoutEffect,
  useRef,
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

/** Most lines an edited message grows to before it scrolls. */
const MAX_EDIT_HEIGHT_PX = 260;

/**
 * The person's message, editable in place.
 *
 * Editing never moves anything: the same `<li>` and the same bubble stay mounted;
 * the bubble keeps its measured width, and the textarea shares the text's font,
 * line-height and wrapping, so it lays out to exactly the same height. The focus
 * ring is a box-shadow, which takes no space, and Cancel/Save replace the pencil in
 * the action row, whose height is reserved either way. Only typing changes the size
 * — which is the person's doing, not the interface's.
 */
function UserBubble({ message }: { readonly message: UserMessage }) {
  const isGenerating = useChat((state) => state.isGenerating);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(message.text);
  const [width, setWidth] = useState<number | undefined>(undefined);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSave = draft.trim().length > 0 && draft.trim() !== message.text;

  // Size the textarea to its content before paint, so entering edit mode and every
  // keystroke render at the final height in one frame.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_EDIT_HEIGHT_PX)}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > MAX_EDIT_HEIGHT_PX ? "auto" : "hidden";
  }, [isEditing, draft]);

  // Caret at the end on entering edit mode, as when clicking into text.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!isEditing || !textarea) return;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, [isEditing]);

  const handleEdit = () => {
    // Sub-pixel exact: offsetWidth rounds, and even 0.2px would nudge the text.
    setWidth(bubbleRef.current?.getBoundingClientRect().width);
    setDraft(message.text);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleSave = () => {
    if (!canSave) return;
    setIsEditing(false);
    void editMessage(message.id, draft);
  };

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(event.target.value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      handleCancel();
    }
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      handleSave();
    }
  };

  return (
    <li className="group flex animate-enter flex-col items-end gap-1">
      <div
        ref={bubbleRef}
        style={isEditing && width !== undefined ? { width } : undefined}
        className={`max-w-[min(36rem,85%)] rounded-bubble rounded-br-md bg-brand-500/12 px-4 py-2.5 text-content transition-shadow ${
          isEditing ? "ring-2 ring-brand-400" : ""
        }`}
      >
        {isEditing ? (
          <>
            <label className="sr-only" htmlFor={`edit-${message.id}`}>
              Edit message. Enter to save, Escape to cancel.
            </label>
            <textarea
              id={`edit-${message.id}`}
              ref={textareaRef}
              rows={1}
              value={draft}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              className="scrollbar-slim block w-full resize-none bg-transparent p-0 text-base leading-relaxed wrap-break-word text-content outline-none"
            />
          </>
        ) : (
          <p className="text-base leading-relaxed wrap-break-word whitespace-pre-wrap">
            {message.text}
          </p>
        )}
      </div>

      {/* Hover-revealed on pointers (always while editing), always on touch. */}
      <div
        className={`flex h-7 items-center gap-1 text-xs text-content-faint transition-opacity pointer-coarse:h-10 ${
          isEditing
            ? ""
            : "group-hover:opacity-100 focus-within:opacity-100 pointer-fine:opacity-0"
        }`}
      >
        {isEditing ? (
          <>
            <span className="mr-1 hidden sm:inline">
              Later replies will be replaced
            </span>
            <RowButton onClick={handleCancel}>Cancel</RowButton>
            <RowButton onClick={handleSave} isDisabled={!canSave} isPrimary>
              Save
            </RowButton>
          </>
        ) : (
          <ActionButton
            label="Edit message"
            onClick={handleEdit}
            isDisabled={isGenerating}
          >
            <Pencil size={13} aria-hidden />
          </ActionButton>
        )}
      </div>
    </li>
  );
}

/** A text button sized to the action row (h-7, h-10 on touch), so it never grows it. */
function RowButton({
  onClick,
  isDisabled = false,
  isPrimary = false,
  children,
}: {
  readonly onClick: () => void;
  readonly isDisabled?: boolean;
  readonly isPrimary?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      className={`h-7 rounded-md px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 pointer-coarse:h-10 ${
        isPrimary
          ? "bg-brand-600 text-white hover:bg-brand-700"
          : "text-content-muted hover:bg-surface-raised hover:text-content"
      }`}
    >
      {children}
    </button>
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
