import { ShieldCheck, X } from "lucide-react";
import { type MouseEvent, type ReactNode, useEffect, useRef } from "react";

import { ProviderPicker } from "@/components/engines.tsx";
import { ThemeToggle } from "@/components/theme.tsx";
import { VoicePicker } from "@/components/voice.tsx";
import { closeSettings, useUi } from "@/stores/ui.ts";

/**
 * Engine, voice and appearance, in one place.
 *
 * A native `<dialog>` opened with `showModal()`: the browser supplies the focus
 * trap, Escape handling, the backdrop and inertness of everything behind it, so
 * none of that is reimplemented here.
 */
function SettingsDialog() {
  const isOpen = useUi((state) => state.isSettingsOpen);
  const hasOpened = useUi((state) => state.hasOpenedSettings);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  // Clicks on the backdrop land on the dialog element itself.
  const handleClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) closeSettings();
  };

  return (
    // Backdrop clicks are a pointer convenience; keyboard users close with Escape,
    // which the native dialog already handles.
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={dialogRef}
      onClose={closeSettings}
      onClick={handleClick}
      aria-labelledby="settings-title"
      className="m-auto max-h-[min(44rem,calc(100dvh-2rem))] w-[min(30rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border-subtle bg-canvas p-0 text-content shadow-float"
    >
      {/*
       * Mounted on first open, so voice lists are not paid for upfront, then kept, so
       * the contents stay visible through the close transition.
       */}
      {hasOpened && (
        <div className="flex max-h-[inherit] flex-col">
          <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3.5">
            <h2 id="settings-title" className="text-base font-semibold tracking-tight">
              Settings
            </h2>
            <button
              type="button"
              onClick={closeSettings}
              aria-label="Close settings"
              className="grid size-8 place-items-center rounded-lg text-content-muted transition-colors hover:bg-surface-raised hover:text-content"
            >
              <X size={17} aria-hidden />
            </button>
          </div>

          <div className="scrollbar-slim flex flex-col gap-6 overflow-y-auto p-5">
            <Section title="Engine" description="Which model answers your messages.">
              <ProviderPicker />
            </Section>

            <Section
              title="Voice"
              description="Have replies read aloud on this device."
            >
              <VoicePicker />
            </Section>

            <Section title="Appearance">
              <ThemeToggle />
            </Section>

            <p className="flex items-start gap-2 rounded-xl bg-brand-500/8 px-3 py-2.5 text-xs leading-relaxed text-content-muted">
              <ShieldCheck
                size={15}
                className="mt-px shrink-0 text-brand-500"
                aria-hidden
              />
              Chats and replies stay in this browser. The only exception is dictation,
              which uses your browser&apos;s speech service.
            </p>
          </div>
        </div>
      )}
    </dialog>
  );
}

type SectionProps = {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
};

function Section({ title, description, children }: SectionProps) {
  return (
    <section className="flex flex-col gap-2.5">
      <div>
        <h3 className="text-sm font-medium text-content">{title}</h3>
        {description && <p className="text-xs text-content-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export { SettingsDialog };
