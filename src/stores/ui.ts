import { create } from "zustand";

type UiState = {
  /** The settings dialog (engine, voice, theme). */
  readonly isSettingsOpen: boolean;
  /** The thread drawer below `lg`. */
  readonly isDrawerOpen: boolean;
};

/**
 * Transient UI state that more than one component — or a slash command — needs to
 * drive. Deliberately not persisted: reopening the app should never land on an open
 * dialog.
 */
export const useUi = create<UiState>(() => ({
  isSettingsOpen: false,
  isDrawerOpen: false,
}));

export function openSettings(): void {
  useUi.setState({ isSettingsOpen: true, isDrawerOpen: false });
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
