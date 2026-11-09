import { Download, Pause, Play, RotateCw, X } from "lucide-react";
import type { ReactNode } from "react";

import { findModel, formatBytes } from "@/engine/providers/models.ts";
import {
  cancelDownload,
  pauseDownload,
  resumeDownload,
  useDownloads,
} from "@/stores/downloads.ts";

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  if (seconds < 60) return `${Math.ceil(seconds)}s left`;
  const minutes = Math.ceil(seconds / 60);
  return minutes < 60 ? `${minutes} min left` : `${(minutes / 60).toFixed(1)} h left`;
}

/**
 * The active model download, top left of the conversation, with its controls.
 *
 * It floats over the transcript (absolutely positioned) rather than sitting in
 * the flow, so appearing, updating and disappearing never move anything. The
 * figures use tabular numerals so the line does not jitter as they change.
 */
function DownloadCard() {
  const activeId = useDownloads((state) => state.activeId);
  const download = useDownloads((state) =>
    state.activeId === undefined ? undefined : state.models[state.activeId],
  );

  if (
    !activeId ||
    !download ||
    download.status === "complete" ||
    download.status === "idle"
  ) {
    return null;
  }

  const model = findModel(activeId);
  const { status, received, total, speed } = download;
  const ratio = total > 0 ? received / total : 0;
  const percent = Math.floor(ratio * 100);

  const handlePause = () => pauseDownload(activeId);
  const handleResume = () => resumeDownload(activeId);
  const handleStop = () => void cancelDownload(activeId);

  const detail =
    status === "failed"
      ? (download.error ?? "The download failed.")
      : [
          `${formatBytes(received)} of ${formatBytes(total)}`,
          status === "downloading" && speed ? `${formatBytes(speed)}/s` : "",
          status === "downloading" && speed
            ? formatDuration((total - received) / speed)
            : "",
          status === "paused" ? "Paused" : "",
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <section
      aria-label={`Downloading ${model.label}`}
      className="absolute top-3 left-3 z-20 w-[min(23rem,calc(100%-1.5rem))] animate-pop rounded-xl border border-border-subtle bg-surface p-3 shadow-float"
    >
      <div className="flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400">
          <Download size={14} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-content">
            {model.label}
            <span className="ml-1.5 font-normal text-content-muted tabular-nums">
              {status === "failed" ? "failed" : `${percent}%`}
            </span>
          </p>
          <p className="truncate text-xs text-content-muted tabular-nums">{detail}</p>
        </div>

        {status === "downloading" && (
          <CardButton label="Pause download" onClick={handlePause}>
            <Pause size={14} aria-hidden />
          </CardButton>
        )}
        {status === "paused" && (
          <CardButton label="Resume download" onClick={handleResume}>
            <Play size={14} aria-hidden />
          </CardButton>
        )}
        {status === "failed" && (
          <CardButton label="Retry download" onClick={handleResume}>
            <RotateCw size={14} aria-hidden />
          </CardButton>
        )}
        <CardButton label="Stop download and delete it" onClick={handleStop}>
          <X size={14} aria-hidden />
        </CardButton>
      </div>

      <div
        role="progressbar"
        aria-label={`${model.label} download`}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-2.5 h-1 overflow-hidden rounded-full bg-surface-raised"
      >
        <div
          className={`h-full origin-left rounded-full transition-transform duration-300 ${
            status === "downloading"
              ? "bg-brand-500"
              : status === "failed"
                ? "bg-danger"
                : "bg-content-faint"
          }`}
          style={{ transform: `scaleX(${ratio})` }}
        />
      </div>
    </section>
  );
}

function CardButton({
  label,
  onClick,
  children,
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-8 shrink-0 place-items-center rounded-lg text-content-muted transition-colors hover:bg-surface-raised hover:text-content pointer-coarse:size-11"
    >
      {children}
    </button>
  );
}

export { DownloadCard };
