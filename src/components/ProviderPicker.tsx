import { Check, Cpu, Download, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ProviderAvailability } from "@/domain/provider.ts";
import { activateProvider, useChat } from "@/stores/chat.ts";

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
 * requirement — because the failure modes here are entirely about the device, and
 * finding out after a 950 MB download is the wrong time.
 */
function ProviderPicker() {
  const statuses = useChat((state) => state.providerStatuses);
  const active = useChat((state) => state.activeProvider);
  const progress = useChat((state) => state.downloadProgress);
  const error = useChat((state) => state.providerError);

  return (
    <section aria-labelledby="engine-heading" className="flex flex-col gap-2">
      <h2
        id="engine-heading"
        className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-content-faint"
      >
        <Cpu size={13} aria-hidden />
        Engine
      </h2>

      <ul className="flex flex-col gap-1.5">
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
                className={`flex w-full flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors ${
                  isActive
                    ? "border-brand-400 bg-brand-500/10"
                    : "border-border-subtle bg-surface hover:border-border-strong"
                } ${isUnavailable ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <span className="flex w-full items-center gap-1.5">
                  <span className="flex-1 text-sm font-medium text-content">
                    {provider.label}
                  </span>
                  {isActive && (
                    <Check size={14} className="text-brand-500" aria-hidden />
                  )}
                  {!isActive && needsDownload && (
                    <Download size={14} className="text-content-faint" aria-hidden />
                  )}
                </span>

                <span className="text-xs leading-snug text-content-muted">
                  {provider.description}
                </span>

                {note && (
                  <span className="text-[0.6875rem] text-content-faint">{note}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <AnimatePresence>
        {progress && <DownloadBar label={progress.label} ratio={progress.ratio} />}
      </AnimatePresence>

      {error && (
        <p
          role="alert"
          className="flex items-start gap-1.5 rounded-lg border border-danger/30 bg-danger/5 px-2.5 py-2 text-xs text-danger"
        >
          <TriangleAlert size={13} className="mt-px shrink-0" aria-hidden />
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
}) {
  const percent = ratio === undefined ? undefined : Math.round(ratio * 100);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
    >
      <div className="flex flex-col gap-1.5 rounded-lg border border-border-subtle bg-surface px-2.5 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-xs text-content-muted">{label}</span>
          {percent !== undefined && (
            <span className="shrink-0 font-mono text-xs text-content-faint">
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
            <motion.div
              animate={{ x: ["-100%", "300%"] }}
              transition={{ duration: 1.4, repeat: Number.POSITIVE_INFINITY }}
              className="h-full w-1/3 rounded-full bg-brand-500"
            />
          ) : (
            <motion.div
              animate={{ width: `${percent}%` }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="h-full rounded-full bg-brand-500"
            />
          )}
        </div>
      </div>
    </motion.div>
  );
}

export { ProviderPicker };
