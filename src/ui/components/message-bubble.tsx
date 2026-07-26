import { Check, Copy, RefreshCw, TriangleAlert } from "lucide-react";
import { motion } from "motion/react";
import { memo, useState } from "react";
import type { AssistantMessage, Message } from "@/domain/message.ts";
import { retryLastReply } from "@/state/chat-store.ts";
import { Markdown } from "../render/markdown.tsx";
import { StreamedMarkdown } from "../render/streamed-markdown.tsx";

const SOURCE_LABELS: Record<AssistantMessage["source"], string> = {
  "prompt-api": "Chrome built-in AI",
  "web-llm": "Local model",
  rules: "Built-in rules",
};

const COPY_FEEDBACK_MS = 1600;

/** Entry animation shared by both bubble kinds. */
const ENTRY = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] as const },
};

type MessageBubbleProps = {
  readonly message: Message;
  /** Enables the retry affordance, shown only on the final message. */
  readonly isLast: boolean;
};

/**
 * Memoised so a streaming reply re-renders only its own bubble. Without this,
 * every committed slice would re-render the entire transcript.
 */
const MessageBubble = memo(function MessageBubble({
  message,
  isLast,
}: MessageBubbleProps) {
  return message.role === "user" ? (
    <UserBubble text={message.text} />
  ) : (
    <AssistantBubble message={message} isLast={isLast} />
  );
});

function UserBubble({ text }: { readonly text: string }) {
  return (
    <motion.li {...ENTRY} className="flex justify-end">
      <div className="max-w-[min(42rem,85%)] rounded-bubble rounded-br-md bg-brand-600 px-4 py-2.5 text-white shadow-sm">
        <p className="whitespace-pre-wrap wrap-break-word text-[0.9375rem] leading-relaxed">
          {text}
        </p>
      </div>
    </motion.li>
  );
}

function AssistantBubble({
  message,
  isLast,
}: {
  readonly message: AssistantMessage;
  readonly isLast: boolean;
}) {
  const isStreaming = message.status === "streaming";
  const hasFailed = message.status === "failed";
  const isEmpty = message.text.trim().length === 0;

  return (
    <motion.li {...ENTRY} className="flex flex-col items-start gap-1.5">
      <div
        className={`max-w-[min(42rem,85%)] rounded-bubble rounded-bl-md border px-4 py-2.5 shadow-sm ${
          hasFailed ? "border-danger/40 bg-danger/5" : "border-border-subtle bg-surface"
        }`}
      >
        {hasFailed ? (
          <p className="flex items-start gap-2 text-[0.9375rem] text-danger">
            <TriangleAlert size={17} className="mt-0.5 shrink-0" aria-hidden />
            <span>{message.error ?? "Something went wrong."}</span>
          </p>
        ) : isStreaming && isEmpty ? (
          <TypingDots />
        ) : (
          /*
           * No caret: the text arriving at a steady pace is itself the signal that
           * generation is in progress, and a blinking block on the last character
           * fights the reading eye.
           *
           * Streaming replies go through llm-ui, which paces the reveal at frame
           * rate. Settled ones render directly — there is nothing left to pace, and
           * routing them through the hook would re-animate history on every mount.
           */
          <div className="message-prose text-[0.9375rem] text-content">
            {isStreaming ? (
              <StreamedMarkdown text={message.text} isStreaming />
            ) : (
              <Markdown text={message.text} />
            )}
          </div>
        )}
      </div>

      {!isStreaming && <MessageFooter message={message} isLast={isLast} />}
    </motion.li>
  );
}

function MessageFooter({
  message,
  isLast,
}: {
  readonly message: AssistantMessage;
  readonly isLast: boolean;
}) {
  const canCopy = message.text.trim().length > 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, delay: 0.05 }}
      className="flex items-center gap-1 pl-1 text-xs text-content-faint"
    >
      <span>{SOURCE_LABELS[message.source]}</span>

      {message.status === "stopped" && (
        <>
          <Separator />
          <span>stopped</span>
        </>
      )}

      {canCopy && (
        <>
          <Separator />
          <CopyButton text={message.text} />
        </>
      )}

      {isLast && (
        <>
          <Separator />
          <button
            type="button"
            onClick={() => void retryLastReply()}
            className="flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:text-content"
          >
            <RefreshCw size={12} aria-hidden />
            Retry
          </button>
        </>
      )}
    </motion.div>
  );
}

function Separator() {
  return <span aria-hidden>·</span>;
}

function CopyButton({ text }: { readonly text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch {
      // Clipboard permission denied; nothing useful to show for a copy button.
    }
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:text-content"
    >
      {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function TypingDots() {
  return (
    // The dots are decorative; the status text is what a screen reader announces.
    <div className="flex items-center gap-1 py-1" role="status">
      <span className="sr-only">Chat Buddy is typing</span>
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          aria-hidden
          className="size-1.5 animate-pulse-dot rounded-full bg-content-muted"
          style={{ animationDelay: `${index * 0.16}s` }}
        />
      ))}
    </div>
  );
}

export { MessageBubble };
