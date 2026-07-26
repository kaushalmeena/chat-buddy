import { useMemo } from "react";
import { useRevealedText } from "@/hooks/useRevealedText.ts";
import { toRenderableMarkdown } from "@/lib/markdown-stream.ts";
import { Markdown } from "./Markdown.tsx";

/**
 * Renders streaming assistant output smoothly.
 *
 * Two separate concerns, each in its own module:
 *
 * - `useRevealedText` decides *how much* to show, releasing text at the display's
 *   frame rate rather than the model's, so bursty arrival reads as an even flow.
 * - `toRenderableMarkdown` makes that prefix *safe* to render, closing an open code
 *   fence and hiding half-written emphasis, links and table rows so no half-parsed
 *   syntax ever flashes on screen.
 *
 * Both replace [llm-ui](https://llm-ui.com/), which did this job until it stopped
 * being maintained in early 2025 — and which peer-depended on React 18, forcing an
 * npm override to install alongside React 19.
 */

type StreamingMarkdownProps = {
  readonly text: string;
  readonly isStreaming: boolean;
};

function StreamingMarkdown({ text, isStreaming }: StreamingMarkdownProps) {
  const revealed = useRevealedText(text, isStreaming);

  // Sanitising walks the string, so only redo it when the visible prefix changes.
  const safe = useMemo(() => toRenderableMarkdown(revealed), [revealed]);

  return <Markdown text={safe} />;
}

export { StreamingMarkdown };
