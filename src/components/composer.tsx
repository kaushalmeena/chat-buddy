import { ArrowUp, type LucideIcon, Mic, Square, Volume2, VolumeX } from "lucide-react";
import {
  type ChangeEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { type Command, matchCommands, resolveCommand } from "@/commands.ts";
import { useSpeechRecognition } from "@/hooks/use-listen.ts";
import { sendMessage, stopGenerating, useChat } from "@/stores/chat.ts";
import { useConfig } from "@/stores/config.ts";

/** Cap on textarea auto-growth before it starts scrolling internally. */
const MAX_TEXTAREA_HEIGHT_PX = 200;

const COMMAND_MENU_ID = "composer-commands";
const COMMAND_HINT_ID = "composer-command-hint";

function Composer() {
  const [draft, setDraft] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isGenerating = useChat((state) => state.isGenerating);

  const suggestions = useMemo(() => matchCommands(draft), [draft]);
  const showSuggestions = suggestions.length > 0 && draft.startsWith("/");
  // Derived rather than clamped in an effect, so a narrowing list never renders an
  // out-of-range highlight for a frame.
  const activeIndex = Math.min(highlighted, Math.max(0, suggestions.length - 1));

  const speech = useSpeechRecognition({
    onFinalResult: (transcript) => {
      setDraft((current) => (current ? `${current} ${transcript}` : transcript));
      textareaRef.current?.focus();
    },
  });

  // Grow to fit the draft, up to a limit. Resetting to `auto` first is what lets it
  // shrink again on delete; `draft` is the trigger, not a value read here.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`;
    // Scroll only past the cap; below it, sub-pixel rounding would flash a scrollbar.
    textarea.style.overflowY =
      textarea.scrollHeight > MAX_TEXTAREA_HEIGHT_PX ? "auto" : "hidden";
  }, [draft]);

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

    // A slash-prefixed word that is not a command should not be sent to the model
    // as if it were a question.
    if (text.startsWith("/")) return;

    setDraft("");
    void sendMessage(text);
  };

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(event.target.value);
    setHighlighted(0);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSuggestions) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlighted((activeIndex + 1) % suggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlighted((activeIndex - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
        const command = suggestions[activeIndex];
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

    // Enter sends, Shift+Enter inserts a newline. Ignore Enter mid-IME composition.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const handleDictate = () => {
    if (speech.isListening) speech.stop();
    else speech.start();
  };

  const canSend = draft.trim().length > 0 && !isGenerating;

  return (
    <div className="relative">
      {showSuggestions && (
        <CommandMenu
          commands={suggestions}
          highlighted={activeIndex}
          onSelect={runCommand}
          onHighlight={setHighlighted}
        />
      )}

      {speech.error && (
        <p className="mb-2 px-1 text-xs text-danger" role="status">
          {speech.error}
        </p>
      )}

      {/*
       * Announces the command menu to assistive tech. `aria-expanded` is not valid on
       * a textbox, and `role="combobox"` would cost the textarea its multiline
       * semantics — a bad trade for a secondary affordance.
       */}
      <p id={COMMAND_HINT_ID} className="sr-only" role="status">
        {showSuggestions
          ? `${suggestions.length} command${suggestions.length === 1 ? "" : "s"} available. Use arrow keys to choose, Tab to accept.`
          : "Type a slash to list commands."}
      </p>

      <div className="rounded-2xl border border-border-subtle bg-surface shadow-card transition-[border-color,box-shadow] focus-within:border-brand-400 focus-within:ring-4 focus-within:ring-brand-500/10">
        <label className="sr-only" htmlFor="composer-input">
          Message Chat Buddy
        </label>
        <textarea
          id="composer-input"
          ref={textareaRef}
          rows={1}
          value={draft}
          placeholder={speech.isListening ? "Listening…" : "Message Chat Buddy…"}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          enterKeyHint="send"
          autoComplete="off"
          autoFocus
          spellCheck
          aria-describedby={COMMAND_HINT_ID}
          className="scrollbar-slim block max-h-50 w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-base leading-relaxed text-content outline-none placeholder:text-content-faint"
        />

        <div className="flex items-center gap-1 px-2 pb-2">
          <SpeakToggle />

          {speech.isSupported && (
            <IconButton
              icon={Mic}
              label={speech.isListening ? "Stop dictating" : "Dictate a message"}
              active={speech.isListening}
              onClick={handleDictate}
            />
          )}

          <span className="ml-1 hidden text-xs text-content-faint sm:inline">
            Type <kbd className="font-mono">/</kbd> for commands, Shift + Enter for a
            new line
          </span>

          <div className="flex-1" />

          {isGenerating ? (
            <button
              type="button"
              onClick={stopGenerating}
              aria-label="Stop generating"
              title="Stop generating"
              className="grid size-8 shrink-0 place-items-center rounded-full bg-content text-canvas transition-[opacity,scale] hover:opacity-85 active:scale-92 pointer-coarse:size-11"
            >
              <Square size={12} fill="currentColor" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!canSend}
              aria-label="Send message"
              title="Send (Enter)"
              className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-600 text-white transition-[background-color,opacity,scale] hover:bg-brand-700 active:scale-92 disabled:cursor-not-allowed disabled:opacity-30 active:disabled:scale-100 pointer-coarse:size-11"
            >
              <ArrowUp size={17} strokeWidth={2.25} aria-hidden />
            </button>
          )}
        </div>
      </div>

      <p className="mt-2 px-2 text-center text-[0.6875rem] text-content-faint">
        Replies are generated on your device and can be wrong.
      </p>
    </div>
  );
}

function SpeakToggle() {
  const enabled = useConfig((state) => state.speakReplies);
  const toggle = useConfig((state) => state.toggleSpeakReplies);

  return (
    <IconButton
      icon={enabled ? Volume2 : VolumeX}
      label={enabled ? "Stop reading replies aloud" : "Read replies aloud"}
      active={enabled}
      onClick={toggle}
    />
  );
}

type IconButtonProps = {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly active?: boolean;
  readonly onClick: () => void;
};

function IconButton({ icon: Icon, label, active = false, onClick }: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`grid size-8 shrink-0 place-items-center rounded-full transition-colors pointer-coarse:size-11 ${
        active
          ? "bg-brand-500/15 text-brand-600 dark:text-brand-400"
          : "text-content-muted hover:bg-surface-raised hover:text-content"
      }`}
    >
      <Icon size={16} aria-hidden />
    </button>
  );
}

type CommandMenuProps = {
  readonly commands: readonly Command[];
  readonly highlighted: number;
  readonly onSelect: (command: Command) => void;
  readonly onHighlight: (index: number) => void;
};

/**
 * A plain list of real buttons, not a scripted listbox: focus stays in the textarea
 * so typing keeps working, and the live region above does the announcing.
 */
function CommandMenu({
  commands,
  highlighted,
  onSelect,
  onHighlight,
}: CommandMenuProps) {
  return (
    <ul
      id={COMMAND_MENU_ID}
      aria-label="Commands"
      className="absolute bottom-full left-0 z-20 mb-2 w-full max-w-sm animate-pop overflow-hidden rounded-xl border border-border-subtle bg-surface p-1 shadow-float"
    >
      {commands.map((command, index) => (
        <CommandItem
          key={command.name}
          command={command}
          index={index}
          isHighlighted={index === highlighted}
          onSelect={onSelect}
          onHighlight={onHighlight}
        />
      ))}
    </ul>
  );
}

type CommandItemProps = {
  readonly command: Command;
  readonly index: number;
  readonly isHighlighted: boolean;
  readonly onSelect: (command: Command) => void;
  readonly onHighlight: (index: number) => void;
};

function CommandItem({
  command,
  index,
  isHighlighted,
  onSelect,
  onHighlight,
}: CommandItemProps) {
  const handleMouseEnter = () => {
    onHighlight(index);
  };

  const handleClick = () => {
    onSelect(command);
  };

  return (
    <li>
      <button
        type="button"
        onMouseEnter={handleMouseEnter}
        onClick={handleClick}
        className={`flex w-full items-baseline gap-3 rounded-lg px-2.5 py-1.5 text-left text-sm ${
          isHighlighted ? "bg-surface-raised" : ""
        }`}
      >
        <span className="font-mono text-brand-600 dark:text-brand-400">
          /{command.name}
        </span>
        <span className="text-xs text-content-muted">{command.description}</span>
      </button>
    </li>
  );
}

export { Composer };
