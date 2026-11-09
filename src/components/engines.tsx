import { Check, Download, TriangleAlert } from "lucide-react";

import type { ProviderAvailability } from "@/domain/provider.ts";
import { type ProviderStatus, UNAVAILABLE_COPY } from "@/engine/providers/registry.ts";
import { activateProvider, useChat } from "@/stores/chat.ts";
import { useConfig } from "@/stores/config.ts";
import { chooseLocalModel } from "@/stores/downloads.ts";

/** Renders bytes as a rounded figure; only used for coarse sizes. */
function formatBytes(bytes: number): string {
  const megabytes = bytes / 1024 / 1024;
  if (megabytes >= 1024) return `${(megabytes / 1024).toFixed(1)} GB`;
  return `${Math.round(megabytes)} MB`;
}

function availabilityNote(availability: ProviderAvailability): string | undefined {
  switch (availability.state) {
    case "ready":
      return undefined;
    case "downloaded":
      return "Downloaded";
    case "needs-download":
      return availability.bytes > 0
        ? `${formatBytes(availability.bytes)} download`
        : "Downloads on first use";
    case "unavailable":
      return UNAVAILABLE_COPY[availability.reason].short;
    default:
      return undefined;
  }
}

/**
 * Lets a person choose which engine answers.
 *
 * Availability is stated up front — download size, WebGPU requirement, browser
 * requirement — because the failure modes here are entirely about the device, and
 * finding out after a 950 MB download is the wrong time.
 */
function ProviderPicker() {
  const statuses = useChat((state) => state.providerStatuses);
  const progress = useChat((state) => state.downloadProgress);
  const error = useChat((state) => state.providerError);

  return (
    <div className="flex flex-col gap-2">
      {statuses.length === 0 ? (
        <ProviderSkeleton />
      ) : (
        <ul className="flex flex-col gap-1.5" aria-label="Engines">
          {statuses.map((status) => (
            <ProviderOption key={status.provider.id} status={status} />
          ))}
        </ul>
      )}

      {progress && <DownloadBar label={progress.label} ratio={progress.ratio} />}

      {error && (
        <p
          role="alert"
          className="flex items-start gap-1.5 rounded-lg border border-danger/30 bg-danger/5 px-2.5 py-2 text-xs text-danger"
        >
          <TriangleAlert size={13} className="mt-px shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

function ProviderOption({ status }: { readonly status: ProviderStatus }) {
  const { provider, availability } = status;
  const isActive = useChat((state) => state.activeProvider?.id === provider.id);
  const isBusy = useChat((state) => state.downloadProgress !== undefined);

  const isUnavailable = availability.state === "unavailable";
  const needsDownload = availability.state === "needs-download";
  const note = availabilityNote(availability);

  const handleSelect = () => {
    // The local provider goes through the download manager, which downloads the
    // chosen model first if needed (pausably) and switches when it is ready.
    if (provider.id === "web-llm") {
      void chooseLocalModel(useConfig.getState().localModelId);
      return;
    }
    void activateProvider(provider.id);
  };

  return (
    <li>
      <button
        type="button"
        disabled={isUnavailable || isBusy}
        onClick={handleSelect}
        aria-current={isActive ? "true" : undefined}
        className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed ${
          isActive
            ? "border-brand-400 bg-brand-500/8"
            : "border-border-subtle bg-surface hover:border-border-strong"
        } ${isUnavailable ? "opacity-55" : ""}`}
      >
        <span
          aria-hidden
          className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border ${
            isActive
              ? "border-brand-600 bg-brand-600 text-white"
              : "border-border-strong"
          }`}
        >
          {isActive && <Check size={10} strokeWidth={3} />}
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2">
            <span className="text-sm font-medium text-content">{provider.label}</span>
            {note && (
              <span className="flex items-center gap-1 rounded-full bg-surface-raised px-1.5 py-px text-[0.6875rem] text-content-muted">
                {needsDownload && <Download size={10} aria-hidden />}
                {note}
              </span>
            )}
          </span>
          <span className="text-xs leading-snug text-content-muted">
            {provider.description}
          </span>
        </span>
      </button>
    </li>
  );
}

function ProviderSkeleton() {
  return (
    <div className="flex flex-col gap-1.5" aria-hidden>
      <div className="h-15 animate-pulse rounded-xl bg-surface-raised" />
      <div className="h-15 animate-pulse rounded-xl bg-surface-raised" />
      <div className="h-15 animate-pulse rounded-xl bg-surface-raised" />
    </div>
  );
}

function DownloadBar({
  label,
  ratio,
}: {
  readonly label: string;
  readonly ratio: number | undefined;
}) {
  const percent = ratio === undefined ? undefined : Math.round(ratio * 100);

  return (
    <div className="flex animate-fade flex-col gap-1.5 rounded-xl border border-border-subtle bg-surface px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xs text-content-muted">{label}</span>
        {percent !== undefined && (
          <span className="shrink-0 font-mono text-xs text-content-faint tabular-nums">
            {percent}%
          </span>
        )}
      </div>

      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1 overflow-hidden rounded-full bg-surface-raised"
      >
        {percent === undefined ? (
          // No ratio available: show motion without implying a position.
          <div className="h-full w-1/3 animate-indeterminate rounded-full bg-brand-500" />
        ) : (
          <div
            className="h-full origin-left rounded-full bg-brand-500 transition-transform duration-300 ease-out"
            style={{ transform: `scaleX(${percent / 100})` }}
          />
        )}
      </div>
    </div>
  );
}

export { ProviderPicker };
