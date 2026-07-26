import { Check, Copy, RefreshCw, TriangleAlert } from "lucide";
import type { JSX } from "preact";
import { useState } from "preact/hooks";
import type { AssistantMessage, Message } from "@/domain/message.ts";
import { retryLastReply } from "@/state/chat-store.ts";
import { Markdown } from "../render/markdown.tsx";
import { Icon } from "./icon.tsx";

const SOURCE_LABELS: Record<AssistantMessage["source"], string> = {
  "prompt-api": "Chrome built-in AI",
  "web-llm": "Local model",
  rules: "Built-in rules",
};

type MessageBubbleProps = {
  readonly message: Message;
  /** Enables the retry affordance, shown only on the final message. */
  readonly isLast: boolean;
};

export function MessageBubble({ message, isLast }: MessageBubbleProps): JSX.Element {
  return message.role === "user" ? (
    <UserBubble message={message} />
  ) : (
    <AssistantBubble message={message} isLast={isLast} />
  );
}

function UserBubble({ message }: { readonly message: Message }): JSX.Element {
  return (
    <li class="flex animate-rise justify-end">
      <div class="max-w-[min(42rem,85%)] rounded-bubble rounded-br-md bg-brand-600 px-4 py-2.5 text-white shadow-sm">
        <p class="whitespace-pre-wrap wrap-break-word text-[0.9375rem] leading-relaxed">
          {message.text}
        </p>
      </div>
    </li>
  );
}

function AssistantBubble({
  message,
  isLast,
}: {
  readonly message: AssistantMessage;
  readonly isLast: boolean;
}): JSX.Element {
  const isStreaming = message.status === "streaming";
  const hasFailed = message.status === "failed";
  const isEmpty = message.text.trim().length === 0;

  return (
    <li class="flex animate-rise flex-col items-start gap-1.5">
      <div
        class={`max-w-[min(42rem,85%)] rounded-bubble rounded-bl-md border px-4 py-2.5 shadow-sm ${
          hasFailed ? "border-danger/40 bg-danger/5" : "border-border-subtle bg-surface"
        }`}
      >
        {hasFailed ? (
          <p class="flex items-start gap-2 text-[0.9375rem] text-danger">
            <Icon icon={TriangleAlert} size={17} class="mt-0.5 shrink-0" />
            <span>{message.error ?? "Something went wrong."}</span>
          </p>
        ) : isStreaming && isEmpty ? (
          <TypingDots />
        ) : (
          <div class="message-prose text-[0.9375rem] text-content">
            <Markdown text={message.text} />
            {isStreaming && (
              <span
                class="ml-0.5 inline-block h-[1.05em] w-0.5 translate-y-[0.15em] animate-caret bg-brand-500"
                aria-hidden="true"
              />
            )}
          </div>
        )}
      </div>

      <MessageFooter message={message} isLast={isLast} />
    </li>
  );
}

function MessageFooter({
  message,
  isLast,
}: {
  readonly message: AssistantMessage;
  readonly isLast: boolean;
}): JSX.Element | null {
  const isStreaming = message.status === "streaming";
  if (isStreaming) return null;

  const canCopy = message.text.trim().length > 0;

  return (
    <div class="flex items-center gap-1 pl-1 text-xs text-content-faint">
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
            class="flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:text-content"
          >
            <Icon icon={RefreshCw} size={12} />
            Retry
          </button>
        </>
      )}
    </div>
  );
}

function Separator(): JSX.Element {
  return <span aria-hidden="true">·</span>;
}

const COPY_FEEDBACK_MS = 1600;

function CopyButton({ text }: { readonly text: string }): JSX.Element {
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
      class="flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:text-content"
    >
      <Icon icon={copied ? Check : Copy} size={12} />
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function TypingDots(): JSX.Element {
  return (
    // The dots are decorative; the status text is what a screen reader announces.
    <div class="flex items-center gap-1 py-1" role="status">
      <span class="sr-only">Chat Buddy is typing</span>
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          aria-hidden="true"
          class="size-1.5 animate-pulse-dot rounded-full bg-content-muted"
          style={{ animationDelay: `${index * 0.16}s` }}
        />
      ))}
    </div>
  );
}
