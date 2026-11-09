import { Cpu, Download, Pause, Play, RotateCw, X } from "lucide-react";
import type { ReactNode } from "react";

import { findModel, formatBytes, type LocalModel } from "@/engine/providers/models.ts";
import { useChat } from "@/stores/chat.ts";
import { useConfig } from "@/stores/config.ts";
import {
  cancelDownload,
  type ModelDownload,
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

type CardView = {
  readonly model: LocalModel;
  readonly phase: "download" | "load";
  /** Shown beside the model name: a percentage, or a word. */
  readonly figure: string;
  readonly detail: string;
  /** Undefined while loading reports no ratio: the bar moves without a position. */
  readonly ratio: number | undefined;
  readonly tone: "active" | "paused" | "failed";
};

/**
 * The local model being fetched or loaded, top left of the conversation, with
 * its controls.
 *
 * A model is ready only once it is on the GPU, so the card covers both phases:
 * the download (pausable, stoppable), then loading the weights from disk onto
 * the GPU, which takes seconds to a minute and cannot be paused. One card
 * changes its text in place across the two, rather than one vanishing and
 * another appearing.
 *
 * It floats over the transcript (absolutely positioned) rather than sitting in
 * the flow, so appearing, updating and disappearing never move anything. The
 * figures use tabular numerals so the line does not jitter as they change.
 */
function DownloadCard() {
  const view = useCardView();
  if (!view) return null;

  const { model, phase, figure, detail, ratio, tone } = view;
  const percent = ratio === undefined ? undefined : Math.floor(ratio * 100);

  return (
    <section
      aria-label={`${phase === "download" ? "Downloading" : "Loading"} ${model.label}`}
      aria-live="polite"
      aria-busy={tone === "active"}
      className="absolute top-3 left-3 z-20 w-[min(23rem,calc(100%-1.5rem))] animate-pop rounded-xl border border-border-subtle bg-surface p-3 shadow-float"
    >
      <div className="flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400">
          {phase === "download" ? (
            <Download size={14} aria-hidden />
          ) : (
            <Cpu size={14} className="animate-pulse" aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-content">
            {model.label}
            <span className="ml-1.5 font-normal text-content-muted tabular-nums">
              {figure}
            </span>
          </p>
          <p className="truncate text-xs text-content-muted tabular-nums">{detail}</p>
        </div>

        {/* A fixed-height slot: loading has no controls, and the card must not
            change height when they go. */}
        <div className="flex h-8 shrink-0 items-center pointer-coarse:h-11">
          {phase === "download" && <DownloadControls id={model.id} tone={tone} />}
        </div>
      </div>

      <div
        role="progressbar"
        aria-label={`${model.label} ${phase === "download" ? "download" : "loading"}`}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-2.5 h-1 overflow-hidden rounded-full bg-surface-raised"
      >
        {ratio === undefined ? (
          <div className="h-full w-1/3 animate-indeterminate rounded-full bg-brand-500" />
        ) : (
          <div
            className={`h-full origin-left rounded-full transition-transform duration-300 ${
              tone === "active"
                ? "bg-brand-500"
                : tone === "failed"
                  ? "bg-danger"
                  : "bg-content-faint"
            }`}
            style={{ transform: `scaleX(${ratio})` }}
          />
        )}
      </div>
    </section>
  );
}

const LOADING_FIGURE = "loading";

/** What the card shows, or undefined when nothing is being fetched or loaded. */
function useCardView(): CardView | undefined {
  const activeId = useDownloads((state) => state.activeId);
  const download = useDownloads((state) =>
    state.activeId === undefined ? undefined : state.models[state.activeId],
  );
  const loading = useChat((state) =>
    state.preparingId === "web-llm" ? state.downloadProgress : undefined,
  );
  const localModelId = useConfig((state) => state.localModelId);

  if (
    activeId &&
    download &&
    download.status !== "idle" &&
    download.status !== "complete"
  ) {
    return downloadView(findModel(activeId), download);
  }

  if (loading) {
    const ratio = loading.ratio;
    return {
      model: findModel(localModelId),
      phase: "load",
      figure: ratio === undefined ? LOADING_FIGURE : `${Math.floor(ratio * 100)}%`,
      detail:
        ratio === undefined
          ? "Setting up on your GPU…"
          : "Loading onto your GPU · no network needed",
      ratio,
      tone: "active",
    };
  }

  // Downloaded and about to be switched to: the moment between the download
  // finishing and loading starting, shown as loading so the card does not blink.
  if (activeId && download?.status === "complete") {
    return {
      model: findModel(activeId),
      phase: "load",
      figure: LOADING_FIGURE,
      detail: "Setting up on your GPU…",
      ratio: undefined,
      tone: "active",
    };
  }

  return undefined;
}

function downloadView(model: LocalModel, download: ModelDownload): CardView {
  const { status, received, total, speed } = download;
  const ratio = total > 0 ? received / total : 0;

  if (status === "failed") {
    return {
      model,
      phase: "download",
      figure: "failed",
      detail: download.error ?? "The download failed.",
      ratio,
      tone: "failed",
    };
  }

  const detail = [
    `${formatBytes(received)} of ${formatBytes(total)}`,
    status === "downloading" && speed ? `${formatBytes(speed)}/s` : "",
    status === "downloading" && speed ? formatDuration((total - received) / speed) : "",
    status === "paused" ? "Paused" : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    model,
    phase: "download",
    figure: `${Math.floor(ratio * 100)}%`,
    detail,
    ratio,
    tone: status === "paused" ? "paused" : "active",
  };
}

function DownloadControls({
  id,
  tone,
}: {
  readonly id: string;
  readonly tone: CardView["tone"];
}) {
  const handlePause = () => pauseDownload(id);
  const handleResume = () => resumeDownload(id);
  const handleStop = () => void cancelDownload(id);

  return (
    <>
      {tone === "active" && (
        <CardButton label="Pause download" onClick={handlePause}>
          <Pause size={14} aria-hidden />
        </CardButton>
      )}
      {tone === "paused" && (
        <CardButton label="Resume download" onClick={handleResume}>
          <Play size={14} aria-hidden />
        </CardButton>
      )}
      {tone === "failed" && (
        <CardButton label="Retry download" onClick={handleResume}>
          <RotateCw size={14} aria-hidden />
        </CardButton>
      )}
      <CardButton label="Stop download and delete it" onClick={handleStop}>
        <X size={14} aria-hidden />
      </CardButton>
    </>
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
