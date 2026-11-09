import { Check, Download, Pause, Play, RotateCw, Trash2, X } from "lucide-react";
import type { ReactNode } from "react";

import {
  formatBytes,
  LOCAL_MODELS,
  type LocalModel,
} from "@/engine/providers/models.ts";
import { useChat } from "@/stores/chat.ts";
import { useConfig } from "@/stores/config.ts";
import {
  cancelDownload,
  chooseLocalModel,
  deleteModel,
  downloadOf,
  pauseDownload,
  resumeDownload,
  useDownloads,
} from "@/stores/downloads.ts";

type ModelListProps = {
  /** Called after a model is chosen, so a menu can close itself. */
  readonly onChoose?: () => void;
  /** Settings shows a delete action on downloaded models; the menu does not. */
  readonly canDelete?: boolean;
  readonly isDisabled?: boolean;
};

/**
 * The local models, each with its download size, GPU need and status.
 *
 * Every row is the same height whatever its state: the progress bar is overlaid
 * along the bottom edge and the action buttons share one fixed-width slot, so a
 * download starting, pausing or finishing never moves the list.
 */
function ModelList({
  onChoose,
  canDelete = false,
  isDisabled = false,
}: ModelListProps) {
  return (
    <ul className="flex flex-col gap-1" aria-label="Local models">
      {LOCAL_MODELS.map((model) => (
        <ModelRow
          key={model.id}
          model={model}
          onChoose={onChoose}
          canDelete={canDelete}
          isDisabled={isDisabled}
        />
      ))}
    </ul>
  );
}

function ModelRow({
  model,
  onChoose,
  canDelete,
  isDisabled,
}: {
  readonly model: LocalModel;
  readonly onChoose: (() => void) | undefined;
  readonly canDelete: boolean;
  readonly isDisabled: boolean;
}) {
  // Subscribing to this row's entry only, so one download's progress does not
  // re-render every row.
  const download =
    useDownloads((state) => state.models[model.id]) ?? downloadOf(model.id);
  const isSelected = useConfig((state) => state.localModelId === model.id);
  const isActive =
    useChat((state) => state.activeProvider?.id === "web-llm") && isSelected;
  const isLoading = useChat((state) => state.preparingId === "web-llm") && isSelected;

  const { status, received, total } = download;
  const ratio = total > 0 ? received / total : 0;
  const showsProgress = status === "downloading" || status === "paused";

  const handleChoose = () => {
    void chooseLocalModel(model.id);
    onChoose?.();
  };

  return (
    <li className="relative overflow-hidden rounded-xl border border-border-subtle bg-surface">
      <div className="flex h-15 items-center gap-2 pr-2">
        <button
          type="button"
          onClick={handleChoose}
          disabled={isDisabled}
          aria-current={isActive ? "true" : undefined}
          className="flex h-full min-w-0 flex-1 flex-col justify-center gap-0.5 px-3 text-left transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium text-content">
              {model.label}
            </span>
            {isActive && (
              <Check
                size={13}
                className="shrink-0 text-brand-600 dark:text-brand-400"
                aria-label="In use"
              />
            )}
          </span>
          <span className="truncate text-xs text-content-muted tabular-nums">
            {isLoading ? "Loading onto your GPU…" : statusLine(model, download)}
          </span>
        </button>

        <div className="flex w-16 shrink-0 items-center justify-end gap-0.5">
          <RowActions model={model} status={status} canDelete={canDelete} />
        </div>
      </div>

      {showsProgress && (
        <div
          role="progressbar"
          aria-label={`${model.label} download`}
          aria-valuenow={Math.round(ratio * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="absolute inset-x-0 bottom-0 h-0.5 bg-surface-raised"
        >
          <div
            className={`h-full origin-left transition-transform duration-300 ${
              status === "paused" ? "bg-content-faint" : "bg-brand-500"
            }`}
            style={{ transform: `scaleX(${ratio})` }}
          />
        </div>
      )}
    </li>
  );
}

function statusLine(
  model: LocalModel,
  download: ReturnType<typeof downloadOf>,
): string {
  const size = formatBytes(model.bytes);
  const gpu = `${(model.gpuMB / 1024).toFixed(1)} GB GPU`;
  switch (download.status) {
    case "complete":
      return `Downloaded · ${size} · ${gpu}`;
    case "downloading":
      return `Downloading ${Math.floor((download.received / download.total) * 100)}% · ${size}`;
    case "paused":
      return `Paused at ${Math.floor((download.received / download.total) * 100)}% · ${size}`;
    case "failed":
      return "Download failed — try again";
    default:
      return `${size} download · ${gpu}`;
  }
}

function RowActions({
  model,
  status,
  canDelete,
}: {
  readonly model: LocalModel;
  readonly status: ReturnType<typeof downloadOf>["status"];
  readonly canDelete: boolean;
}) {
  const handlePause = () => pauseDownload(model.id);
  const handleResume = () => resumeDownload(model.id);
  const handleCancel = () => void cancelDownload(model.id);
  const handleDelete = () => void deleteModel(model.id);
  const handleDownload = () => void chooseLocalModel(model.id);

  switch (status) {
    case "downloading":
      return (
        <>
          <IconAction label={`Pause ${model.label}`} onClick={handlePause}>
            <Pause size={14} aria-hidden />
          </IconAction>
          <IconAction label={`Stop ${model.label} download`} onClick={handleCancel}>
            <X size={14} aria-hidden />
          </IconAction>
        </>
      );
    case "paused":
      return (
        <>
          <IconAction label={`Resume ${model.label}`} onClick={handleResume}>
            <Play size={14} aria-hidden />
          </IconAction>
          <IconAction label={`Stop ${model.label} download`} onClick={handleCancel}>
            <X size={14} aria-hidden />
          </IconAction>
        </>
      );
    case "failed":
      return (
        <IconAction label={`Retry ${model.label}`} onClick={handleResume}>
          <RotateCw size={14} aria-hidden />
        </IconAction>
      );
    case "complete":
      return canDelete ? (
        <IconAction label={`Delete ${model.label}`} onClick={handleDelete} isDanger>
          <Trash2 size={14} aria-hidden />
        </IconAction>
      ) : null;
    default:
      return (
        <IconAction label={`Download ${model.label}`} onClick={handleDownload}>
          <Download size={14} aria-hidden />
        </IconAction>
      );
  }
}

function IconAction({
  label,
  onClick,
  isDanger = false,
  children,
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly isDanger?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid size-8 place-items-center rounded-lg transition-colors pointer-coarse:size-11 ${
        isDanger
          ? "text-content-faint hover:bg-danger/10 hover:text-danger"
          : "text-content-muted hover:bg-surface-raised hover:text-content"
      }`}
    >
      {children}
    </button>
  );
}

export { ModelList };
