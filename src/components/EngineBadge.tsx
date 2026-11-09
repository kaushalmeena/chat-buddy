import { ChevronDown } from "lucide-react";

import { useChat } from "@/stores/chat.ts";
import { openSettings } from "@/stores/ui.ts";

/**
 * Which engine is answering, as a button into the settings dialog — the place to
 * change it. A download in progress takes over the badge, so it stays visible
 * after the dialog is closed.
 */
function EngineBadge() {
  const provider = useChat((state) => state.activeProvider);
  const progress = useChat((state) => state.downloadProgress);

  const percent =
    progress?.ratio === undefined ? undefined : Math.round(progress.ratio * 100);

  if (!provider && !progress) {
    return (
      <span
        className="h-8 w-32 animate-pulse rounded-full bg-surface-raised"
        aria-hidden
      />
    );
  }

  return (
    <button
      type="button"
      onClick={openSettings}
      aria-label={`Engine: ${provider?.label ?? "loading"}. Change engine`}
      className="flex h-8 shrink-0 animate-fade items-center gap-2 rounded-full border border-border-subtle bg-surface pr-2 pl-3 text-xs text-content-muted shadow-card transition-colors hover:border-border-strong hover:text-content"
    >
      {progress ? (
        <>
          <span
            className="size-1.5 animate-pulse rounded-full bg-brand-500"
            aria-hidden
          />
          <span className="max-w-36 truncate">
            Downloading{percent === undefined ? "…" : ` ${percent}%`}
          </span>
        </>
      ) : (
        <>
          <span className="size-1.5 rounded-full bg-success" aria-hidden />
          <span className="max-w-36 truncate">{provider?.label}</span>
        </>
      )}
      <ChevronDown size={13} className="text-content-faint" aria-hidden />
    </button>
  );
}

export { EngineBadge };
