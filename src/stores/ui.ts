import { create } from "zustand";

import type { Conversation } from "@/domain/conversation.ts";

type UiState = {
  /** The settings dialog (engine, voice, theme). */
  readonly isSettingsOpen: boolean;
  /**
   * True from the first open onwards. The dialog's contents mount lazily, then stay
   * mounted so they remain visible while the close transition plays.
   */
  readonly hasOpenedSettings: boolean;
  /** The thread drawer below `lg`. */
  readonly isDrawerOpen: boolean;
  /** The most recently deleted thread, while its undo toast is showing. */
  readonly deleted: Conversation | undefined;
};

/**
 * Transient UI state that more than one component — or a slash command — needs to
 * drive. Deliberately not persisted: reopening the app should never land on an open
 * dialog.
 */
export const useUi = create<UiState>(() => ({
  isSettingsOpen: false,
  hasOpenedSettings: false,
  isDrawerOpen: false,
  deleted: undefined,
}));

export function openSettings(): void {
  useUi.setState({
    isSettingsOpen: true,
    hasOpenedSettings: true,
    isDrawerOpen: false,
  });
}

export function closeSettings(): void {
  useUi.setState({ isSettingsOpen: false });
}

export function openDrawer(): void {
  useUi.setState({ isDrawerOpen: true });
}

export function closeDrawer(): void {
  useUi.setState({ isDrawerOpen: false });
}

export function offerUndo(conversation: Conversation): void {
  useUi.setState({ deleted: conversation });
}

export function dismissUndo(): void {
  useUi.setState({ deleted: undefined });
}
