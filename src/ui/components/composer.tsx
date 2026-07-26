import { ArrowUp, Mic, Square, Volume2, VolumeX } from "lucide";
import type { JSX } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { isGenerating, sendMessage, stopGenerating } from "@/state/chat-store.ts";
import { speakReplies } from "@/state/settings-store.ts";
import { type Command, matchCommands, resolveCommand } from "../commands.ts";
import { useSpeechRecognition } from "../hooks/use-speech-recognition.ts";
import { Icon } from "./icon.tsx";

/** Cap on textarea auto-growth before it starts scrolling internally. */
const MAX_TEXTAREA_HEIGHT_PX = 200;

const COMMAND_MENU_ID = "composer-commands";
const COMMAND_HINT_ID = "composer-command-hint";

export function Composer(): JSX.Element {
  const [draft, setDraft] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const suggestions = useMemo(() => matchCommands(draft), [draft]);
  const showSuggestions = suggestions.length > 0 && draft.startsWith("/");

  const speech = useSpeechRecognition({
    onFinalResult: (transcript) => {
      setDraft((current) => (current ? `${current} ${transcript}` : transcript));
      textareaRef.current?.focus();
    },
  });

  // Grow to fit the draft, up to a limit. Reset first so deleting text shrinks.
  // `draft` is the trigger rather than a read value — the effect measures the
  // already-rendered `scrollHeight`, which is what `draft` determines.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `draft` triggers the re-measure.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`;
  }, [draft]);

  // Keep the highlighted suggestion in range as the list narrows.
  useEffect(() => {
    setHighlighted((current) => Math.min(current, Math.max(0, suggestions.length - 1)));
  }, [suggestions.length]);

  const runCommand = (command: Command) => {
    command.run();
    setDraft("");
    textareaRef.current?.focus();
  };

  const submit = () => {
    const text = draft.trim();
    if (text.length === 0) return;

    const command = resolveCommand(text);
    if (command) {
      runCommand(command);
      return;
    }

    // A slash-prefixed word that is not a command should not be sent to the
    // model as if it were a question.
    if (text.startsWith("/")) return;

    setDraft("");
    void sendMessage(text);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (showSuggestions) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlighted((current) => (current + 1) % suggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlighted(
          (current) => (current - 1 + suggestions.length) % suggestions.length,
        );
        return;
      }
      if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
        const command = suggestions[highlighted];
        if (command) {
          event.preventDefault();
          runCommand(command);
          return;
        }
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setDraft("");
        return;
      }
    }

    // Enter sends, Shift+Enter inserts a newline.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const generating = isGenerating.value;
  const canSend = draft.trim().length > 0 && !generating;

  return (
    <div class="relative">
      {showSuggestions && (
        <CommandMenu
          commands={suggestions}
          highlighted={highlighted}
          onSelect={runCommand}
          onHighlight={setHighlighted}
        />
      )}

      {speech.error && (
        <p class="mb-2 px-1 text-xs text-danger" role="status">
          {speech.error}
        </p>
      )}

      {/*
       * Announces the command menu to assistive tech.
       *
       * `aria-expanded` would be the idiomatic signal, but it is not valid on a
       * textbox, and giving the textarea `role="combobox"` to accept it would
       * cost it its multiline semantics — a bad trade for a secondary
       * affordance. A polite live region conveys the same thing without
       * touching how the composer itself is announced.
       */}
      <p id={COMMAND_HINT_ID} class="sr-only" role="status">
        {showSuggestions
          ? `${suggestions.length} command${suggestions.length === 1 ? "" : "s"} available. Use arrow keys to choose, Tab to accept.`
          : "Type a slash to list commands."}
      </p>

      <div class="flex items-end gap-2 rounded-3xl border border-border-subtle bg-surface p-2 shadow-sm transition-colors focus-within:border-brand-400">
        <label class="sr-only" for="composer-input">
          Message Chat Buddy
        </label>
        <textarea
          id="composer-input"
          ref={textareaRef}
          rows={1}
          value={draft}
          placeholder={speech.isListening ? "Listening…" : "Message Chat Buddy…"}
          onInput={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={onKeyDown}
          enterkeyhint="send"
          autocomplete="off"
          spellcheck
          aria-describedby={COMMAND_HINT_ID}
          class="scrollbar-slim max-h-50 flex-1 resize-none bg-transparent px-2 py-1.5 text-[0.9375rem] text-content outline-none placeholder:text-content-faint"
        />

        <SpeakToggle />

        {speech.isSupported && (
          <IconButton
            icon={Mic}
            label={speech.isListening ? "Stop dictating" : "Dictate a message"}
            active={speech.isListening}
            onClick={() => (speech.isListening ? speech.stop() : speech.start())}
          />
        )}

        {generating ? (
          <button
            type="button"
            onClick={stopGenerating}
            aria-label="Stop generating"
            class="grid size-9 shrink-0 place-items-center rounded-full bg-content text-canvas transition-opacity hover:opacity-80"
          >
            <Icon icon={Square} size={15} />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            aria-label="Send message"
            class="grid size-9 shrink-0 place-items-center rounded-full bg-brand-600 text-white transition-all hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Icon icon={ArrowUp} size={18} />
          </button>
        )}
      </div>

      <p class="mt-2 px-2 text-center text-[0.6875rem] text-content-faint">
        Replies are generated on your device. Type <kbd class="font-mono">/</kbd> for
        commands.
      </p>
    </div>
  );
}

function SpeakToggle(): JSX.Element {
  const enabled = speakReplies.value;
  return (
    <IconButton
      icon={enabled ? Volume2 : VolumeX}
      label={enabled ? "Stop reading replies aloud" : "Read replies aloud"}
      active={enabled}
      onClick={() => {
        speakReplies.value = !enabled;
      }}
    />
  );
}

type IconButtonProps = {
  readonly icon: Parameters<typeof Icon>[0]["icon"];
  readonly label: string;
  readonly active?: boolean;
  readonly onClick: () => void;
};

function IconButton({ icon, label, active, onClick }: IconButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      class={`grid size-9 shrink-0 place-items-center rounded-full transition-colors ${
        active
          ? "bg-brand-500/15 text-brand-500"
          : "text-content-muted hover:bg-surface-raised hover:text-content"
      }`}
    >
      <Icon icon={icon} size={17} />
    </button>
  );
}

type CommandMenuProps = {
  readonly commands: readonly Command[];
  readonly highlighted: number;
  readonly onSelect: (command: Command) => void;
  readonly onHighlight: (index: number) => void;
};

function CommandMenu({
  commands,
  highlighted,
  onSelect,
  onHighlight,
}: CommandMenuProps): JSX.Element {
  return (
    /*
     * A plain list of real buttons, not a scripted listbox.
     *
     * Focus deliberately stays in the textarea so typing continues to work while
     * the menu is open, which rules out the listbox/option pattern — its options
     * must be focusable or referenced by `aria-activedescendant`. Instead the
     * textarea owns the relationship (`aria-expanded` / `aria-controls`), and
     * these buttons are the pointer affordance and a keyboard-reachable fallback.
     */
    <ul
      id={COMMAND_MENU_ID}
      aria-label="Commands"
      class="absolute bottom-full left-0 z-20 mb-2 w-full max-w-sm overflow-hidden rounded-xl border border-border-subtle bg-surface shadow-lg"
    >
      {commands.map((command, index) => (
        <li key={command.name}>
          <button
            type="button"
            onMouseEnter={() => onHighlight(index)}
            onClick={() => onSelect(command)}
            data-highlighted={index === highlighted ? "" : undefined}
            class={`flex w-full items-baseline gap-3 px-3 py-2 text-left text-sm transition-colors ${
              index === highlighted ? "bg-surface-raised" : ""
            }`}
          >
            <span class="font-mono text-brand-500">/{command.name}</span>
            <span class="text-xs text-content-muted">{command.description}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
