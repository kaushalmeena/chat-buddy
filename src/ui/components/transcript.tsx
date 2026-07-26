import { ArrowDown } from "lucide";
import type { JSX } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { isAssistantMessage } from "@/domain/message.ts";
import { messages } from "@/state/chat-store.ts";
import { speakReplies } from "@/state/settings-store.ts";
import { useAutoScroll } from "../hooks/use-auto-scroll.ts";
import { useSpeechSynthesis } from "../hooks/use-speech-synthesis.ts";
import { EmptyState } from "./empty-state.tsx";
import { Icon } from "./icon.tsx";
import { MessageBubble } from "./message-bubble.tsx";

export function Transcript(): JSX.Element {
  const list = messages.value;

  // The streamed text of the final message is the scroll trigger: new tokens
  // grow the container without changing the message count.
  const tail = list.at(-1);
  const { ref, isPinned, scrollToBottom } = useAutoScroll<HTMLDivElement>(
    `${list.length}:${tail?.text.length ?? 0}`,
  );

  useSpokenReplies();

  if (list.length === 0) {
    return <EmptyState />;
  }

  return (
    <div class="relative flex-1 overflow-hidden">
      <div ref={ref} class="scrollbar-slim h-full overflow-y-auto px-4 py-6">
        <ol
          // `log` + polite announces new replies without stealing focus, and
          // without re-reading the whole transcript on each token.
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-label="Conversation"
          class="mx-auto flex max-w-3xl flex-col gap-5"
        >
          {list.map((message, index) => (
            <MessageBubble
              key={message.id}
              message={message}
              isLast={index === list.length - 1 && isAssistantMessage(message)}
            />
          ))}
        </ol>
      </div>

      {!isPinned && (
        <button
          type="button"
          onClick={() => scrollToBottom()}
          aria-label="Jump to latest message"
          class="absolute bottom-4 left-1/2 grid size-9 -translate-x-1/2 place-items-center rounded-full border border-border-subtle bg-surface text-content-muted shadow-md transition-colors hover:text-content"
        >
          <Icon icon={ArrowDown} size={17} />
        </button>
      )}
    </div>
  );
}

/**
 * Reads each completed assistant reply aloud when the preference is on.
 *
 * Deliberately waits for `complete` rather than speaking as tokens arrive:
 * synthesising partial text produces chopped, overlapping speech.
 */
function useSpokenReplies(): void {
  const { speak, cancel, isSupported } = useSpeechSynthesis();
  const spokenIdRef = useRef<string | undefined>(undefined);

  const list = messages.value;
  const enabled = speakReplies.value;
  const tail = list.at(-1);

  const readyToSpeak =
    tail && isAssistantMessage(tail) && tail.status === "complete" ? tail : undefined;

  // `enabled` is read below and must stay in the dependency list: without it,
  // switching the preference off mid-utterance would not cancel the speech.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `enabled` is read in the body.
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
