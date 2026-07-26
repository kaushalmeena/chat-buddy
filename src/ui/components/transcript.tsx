import { ArrowDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import { isAssistantMessage } from "@/domain/message.ts";
import { selectMessages, useChat } from "@/state/chat-store.ts";
import { useSettings } from "@/state/settings-store.ts";
import { useAutoScroll } from "../hooks/use-auto-scroll.ts";
import { useSpeechSynthesis } from "../hooks/use-speech-synthesis.ts";
import { EmptyState } from "./empty-state.tsx";
import { MessageBubble } from "./message-bubble.tsx";

function Transcript() {
  const messages = useChat(selectMessages);

  // The streamed length of the final message is the scroll trigger: new text
  // grows the container without changing the message count.
  const tail = messages.at(-1);
  const { ref, isPinned, scrollToBottom } = useAutoScroll<HTMLDivElement>(
    `${messages.length}:${tail?.text.length ?? 0}`,
  );

  useSpokenReplies();

  if (messages.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="relative flex-1 overflow-hidden">
      <div ref={ref} className="scrollbar-slim h-full overflow-y-auto px-4 py-6">
        <ol
          // `log` + polite announces new replies without stealing focus and
          // without re-reading the transcript on every committed slice.
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-label="Conversation"
          className="mx-auto flex max-w-3xl flex-col gap-5"
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

      <AnimatePresence>
        {!isPinned && (
          <motion.button
            type="button"
            onClick={() => scrollToBottom()}
            aria-label="Jump to latest message"
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.9 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="absolute bottom-4 left-1/2 grid size-9 -translate-x-1/2 place-items-center rounded-full border border-border-subtle bg-surface text-content-muted shadow-md transition-colors hover:text-content"
          >
            <ArrowDown size={17} aria-hidden />
          </motion.button>
        )}
      </AnimatePresence>
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
  const enabled = useSettings((state) => state.speakReplies);

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
