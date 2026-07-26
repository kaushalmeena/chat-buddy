import { Check, Cpu, Download, TriangleAlert } from "lucide";
import type { JSX } from "preact";
import type { ProviderAvailability } from "@/domain/provider.ts";
import {
  activateProvider,
  activeProvider,
  downloadProgress,
  providerError,
  providerStatuses,
} from "@/state/chat-store.ts";
import { Icon } from "./icon.tsx";

/** Renders bytes as a rounded megabyte figure; only used for coarse sizes. */
function formatBytes(bytes: number): string {
  const megabytes = bytes / 1024 / 1024;
  if (megabytes >= 1024) return `${(megabytes / 1024).toFixed(1)} GB`;
  return `${Math.round(megabytes)} MB`;
}

function availabilityNote(availability: ProviderAvailability): string | undefined {
  switch (availability.state) {
    case "ready":
      return undefined;
    case "needs-download":
      return availability.bytes > 0
        ? `Downloads ${formatBytes(availability.bytes)}`
        : "Downloads on first use";
    case "unavailable":
      switch (availability.reason) {
        case "no-webgpu":
          return "Needs WebGPU";
        case "unsupported-browser":
          return "Needs Chrome 148+ on desktop";
        case "insufficient-resources":
          return "Not enough free storage or memory";
        default:
          return "Unavailable on this device";
      }
    default:
      return undefined;
  }
}

/**
 * Lets a person choose which engine answers.
 *
 * Availability is stated up front — download size, WebGPU requirement, browser
 * requirement — because the failure modes here are entirely about the device,
 * and finding out after a 950 MB download is the wrong time.
 */
export function ProviderPicker(): JSX.Element {
  const statuses = providerStatuses.value;
  const active = activeProvider.value;
  const progress = downloadProgress.value;
  const error = providerError.value;

  return (
    <section aria-labelledby="engine-heading" class="flex flex-col gap-2">
      <h2
        id="engine-heading"
        class="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-content-faint"
      >
        <Icon icon={Cpu} size={13} />
        Engine
      </h2>

      <ul class="flex flex-col gap-1.5">
        {statuses.map(({ provider, availability }) => {
          const isActive = provider.id === active?.id;
          const isUnavailable = availability.state === "unavailable";
          const note = availabilityNote(availability);
          const needsDownload = availability.state === "needs-download";

          return (
            <li key={provider.id}>
              <button
                type="button"
                disabled={isUnavailable || progress !== undefined}
                onClick={() => void activateProvider(provider.id)}
                aria-current={isActive ? "true" : undefined}
                class={`flex w-full flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors ${
                  isActive
                    ? "border-brand-400 bg-brand-500/10"
                    : "border-border-subtle bg-surface hover:border-border-strong"
                } ${isUnavailable ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <span class="flex w-full items-center gap-1.5">
                  <span class="flex-1 text-sm font-medium text-content">
                    {provider.label}
                  </span>
                  {isActive && <Icon icon={Check} size={14} class="text-brand-500" />}
                  {!isActive && needsDownload && (
                    <Icon icon={Download} size={14} class="text-content-faint" />
                  )}
                </span>

                <span class="text-xs leading-snug text-content-muted">
                  {provider.description}
                </span>

                {note && (
                  <span class="text-[0.6875rem] text-content-faint">{note}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {progress && <DownloadBar label={progress.label} ratio={progress.ratio} />}

      {error && (
        <p
          role="alert"
          class="flex items-start gap-1.5 rounded-lg border border-danger/30 bg-danger/5 px-2.5 py-2 text-xs text-danger"
        >
          <Icon icon={TriangleAlert} size={13} class="mt-px shrink-0" />
          {error}
        </p>
      )}
    </section>
  );
}

function DownloadBar({
  label,
  ratio,
}: {
  readonly label: string;
  readonly ratio: number | undefined;
}): JSX.Element {
  const percent = ratio === undefined ? undefined : Math.round(ratio * 100);

  return (
    <div class="flex flex-col gap-1.5 rounded-lg border border-border-subtle bg-surface px-2.5 py-2">
      <div class="flex items-baseline justify-between gap-2">
        <span class="truncate text-xs text-content-muted">{label}</span>
        {percent !== undefined && (
          <span class="shrink-0 font-mono text-xs text-content-faint">{percent}%</span>
        )}
      </div>

      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        class="h-1 overflow-hidden rounded-full bg-surface-raised"
      >
        <div
          class={`h-full rounded-full bg-brand-500 transition-[width] duration-300 ${
            percent === undefined ? "w-1/3 animate-pulse" : ""
          }`}
          style={percent === undefined ? undefined : { width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
