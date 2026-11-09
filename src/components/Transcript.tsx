import { ArrowDown } from "lucide-react";
import { useEffect, useRef } from "react";

import { isAssistantMessage } from "@/domain/message.ts";
import { useChatAutoScroll } from "@/hooks/useChatAutoScroll.ts";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis.ts";
import { selectMessages, useChat } from "@/stores/chat.ts";
import { useConfig } from "@/stores/config.ts";

import { EmptyState } from "./EmptyState.tsx";
import { MessageBubble } from "./MessageBubble.tsx";

function Transcript() {
  const messages = useChat(selectMessages);
  const isHydrated = useChat((state) => state.isHydrated);

  // The streamed length of the final message is the scroll trigger: new text grows
  // the container without changing the message count.
  const tail = messages.at(-1);
  const { ref, isPinned, scrollToBottom } = useChatAutoScroll<HTMLDivElement>(
    `${messages.length}:${tail?.text.length ?? 0}`,
  );

  useSpokenReplies();

  const handleJump = () => {
    scrollToBottom();
  };

  /*
   * Until IndexedDB has answered, render an empty canvas rather than the empty
   * state: otherwise a returning visitor sees "How can I help?" flash and then be
   * replaced by their history — the largest layout shift the app could produce.
   */
  if (!isHydrated) {
    return <div className="flex-1" />;
  }

  if (messages.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={ref}
        // A stable gutter so the content does not jump sideways when a reply grows
        // long enough to need a scrollbar.
        className="scrollbar-slim h-full scrollbar-gutter-both overflow-y-auto px-4 pt-6 pb-10"
      >
        <ol
          // `log` + polite announces new replies without stealing focus and without
          // re-reading the transcript on every committed slice.
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-label="Conversation"
          className="mx-auto flex max-w-3xl flex-col gap-6"
        >
          {messages.map((message, index) => (
            <MessageBubble
              key={message.id}
              message={message}
              isLast={index === messages.length - 1 && isAssistantMessage(message)}
            />
          ))}
        </ol>
      </div>

      {/* Fades the transcript into the composer instead of a hard cut. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-linear-to-t from-canvas to-transparent"
      />

      <button
        type="button"
        onClick={handleJump}
        aria-label="Jump to latest message"
        tabIndex={isPinned ? -1 : 0}
        aria-hidden={isPinned}
        // Always mounted and toggled with opacity/transform, so showing it never
        // causes a reflow.
        className={`absolute bottom-4 left-1/2 grid size-9 -translate-x-1/2 place-items-center rounded-full border border-border-subtle bg-surface text-content-muted shadow-float transition-[opacity,translate,color] duration-200 hover:text-content ${
          isPinned
            ? "pointer-events-none translate-y-2 opacity-0"
            : "translate-y-0 opacity-100"
        }`}
      >
        <ArrowDown size={17} aria-hidden />
      </button>
    </div>
  );
}

/**
 * Reads each completed assistant reply aloud when the preference is on.
 *
 * Deliberately waits for `complete` rather than speaking as text arrives:
 * synthesising partial text produces chopped, overlapping speech.
 */
function useSpokenReplies(): void {
  const { speak, cancel, isSupported } = useSpeechSynthesis();
  const spokenIdRef = useRef<string | undefined>(undefined);

  const messages = useChat(selectMessages);
  const enabled = useConfig((state) => state.speakReplies);

  const tail = messages.at(-1);
  const readyToSpeak =
    tail && isAssistantMessage(tail) && tail.status === "complete" ? tail : undefined;

  useEffect(() => {
    if (!isSupported) return;

    if (!enabled) {
      cancel();
      return;
    }

    if (!readyToSpeak) return;
    if (spokenIdRef.current === readyToSpeak.id) return;

    spokenIdRef.current = readyToSpeak.id;
    speak(readyToSpeak.text);
  }, [enabled, isSupported, readyToSpeak, speak, cancel]);
}

export { Transcript };
