import { Check, ChevronDown, Cpu } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import type { ReplySource } from "@/domain/message.ts";
import { findModel } from "@/engine/providers/models.ts";
import type { ProviderStatus } from "@/engine/providers/registry.ts";
import { UNAVAILABLE_COPY } from "@/engine/providers/registry.ts";
import { activateProvider, useChat } from "@/stores/chat.ts";
import { useConfig } from "@/stores/config.ts";

import { ModelList } from "./models.tsx";

const SHORT_LABELS: Record<Exclude<ReplySource, "web-llm">, string> = {
  "prompt-api": "Gemini Nano",
  rules: "Offline Buddy",
};

/**
 * Model selector in the composer: what will answer the next message, changeable
 * without leaving the conversation.
 *
 * The menu floats above the composer (absolutely positioned, like the command
 * menu), so opening it never moves the transcript.
 */
function ModelPicker() {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = useChat((state) => state.activeProvider);
  const localModelId = useConfig((state) => state.localModelId);

  const label =
    active?.id === "web-llm"
      ? findModel(localModelId).label
      : active
        ? SHORT_LABELS[active.id]
        : "Loading…";

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (!rootRef.current?.contains(target)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleToggle = () => {
    setIsOpen((open) => !open);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        title="Choose the model"
        className="flex h-8 max-w-44 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-content-muted transition-colors hover:bg-surface-raised hover:text-content pointer-coarse:h-11"
      >
        <Cpu size={14} className="shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
        <ChevronDown size={13} className="shrink-0 text-content-faint" aria-hidden />
      </button>

      {isOpen && <PickerMenu onClose={handleClose} />}
    </div>
  );
}

function PickerMenu({ onClose }: { readonly onClose: () => void }) {
  const statuses = useChat((state) => state.providerStatuses);
  const local = statuses.find((status) => status.provider.id === "web-llm");
  const builtIn = statuses.filter((status) => status.provider.id !== "web-llm");
  const localUnavailable = local?.availability.state === "unavailable";

  return (
    <div
      role="dialog"
      aria-label="Choose a model"
      className="scrollbar-slim absolute bottom-full left-0 z-30 mb-2 max-h-[min(30rem,60dvh)] w-[min(24rem,calc(100vw-2rem))] animate-pop overflow-y-auto rounded-2xl border border-border-subtle bg-surface p-2 shadow-float"
    >
      <MenuHeading>Built in</MenuHeading>
      <ul className="mb-2 flex flex-col gap-0.5">
        {builtIn.map((status) => (
          <BuiltInOption key={status.provider.id} status={status} onChosen={onClose} />
        ))}
      </ul>

      <MenuHeading>
        Local models
        <span className="font-normal text-content-faint">
          {" "}
          · run on your GPU, offline
        </span>
      </MenuHeading>
      {localUnavailable && local.availability.state === "unavailable" ? (
        <p className="px-2 pb-2 text-xs text-content-muted">
          {UNAVAILABLE_COPY[local.availability.reason].long}
        </p>
      ) : (
        <ModelList onChoose={onClose} />
      )}
    </div>
  );
}

function MenuHeading({ children }: { readonly children: ReactNode }) {
  return (
    <p className="px-2 pt-1 pb-1.5 text-xs font-medium text-content-muted">
      {children}
    </p>
  );
}

function BuiltInOption({
  status,
  onChosen,
}: {
  readonly status: ProviderStatus;
  readonly onChosen: () => void;
}) {
  const isActive = useChat((state) => state.activeProvider?.id === status.provider.id);
  const isUnavailable = status.availability.state === "unavailable";

  const handleSelect = () => {
    void activateProvider(status.provider.id);
    onChosen();
  };

  return (
    <li>
      <button
        type="button"
        onClick={handleSelect}
        disabled={isUnavailable}
        aria-current={isActive ? "true" : undefined}
        className="flex w-full items-center gap-2 rounded-lg p-2 text-left transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm text-content">{status.provider.label}</span>
          <span className="truncate text-xs text-content-muted">
            {status.availability.state === "unavailable"
              ? UNAVAILABLE_COPY[status.availability.reason].short
              : status.provider.description}
          </span>
        </span>
        {isActive && (
          <Check
            size={14}
            className="shrink-0 text-brand-600 dark:text-brand-400"
            aria-hidden
          />
        )}
      </button>
    </li>
  );
}

export { ModelPicker };
