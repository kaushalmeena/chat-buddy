import { type ComponentType, useEffect, useState } from "react";

/**
 * Markdown, loaded on demand.
 *
 * react-markdown and the unified/remark/micromark stack behind it are the largest
 * dependency the shell has, and nothing on first paint needs them: an empty thread
 * renders no assistant text at all. Splitting them out keeps the entry bundle small,
 * and `preloadRichText` starts the fetch alongside the IndexedDB read.
 *
 * No `React.lazy` and no Suspense: lazy suspends for a tick even when the code is
 * cached, and any fallback that later becomes formatted markdown is a layout shift.
 * Instead the module is held here once loaded and rendered synchronously, and the
 * transcript waits for `useRichTextReady` before showing history — so it appears
 * once, already formatted.
 */
type MarkdownComponent = ComponentType<{ readonly text: string }>;

let Markdown: MarkdownComponent | undefined;
let loading: Promise<void> | undefined;

export function preloadRichText(): Promise<void> {
  loading ??= import("./markdown.tsx").then((module) => {
    Markdown = module.Markdown;
    return undefined;
  });
  return loading;
}

/** True once markdown can render synchronously. */
export function useRichTextReady(): boolean {
  const [isReady, setIsReady] = useState(Markdown !== undefined);

  useEffect(() => {
    if (isReady) return;
    let isCurrent = true;
    void preloadRichText().then(() => {
      if (isCurrent) setIsReady(true);
      return undefined;
    });
    return () => {
      isCurrent = false;
    };
  }, [isReady]);

  return isReady;
}

function RichText({ text }: { readonly text: string }) {
  // Only reachable before load by a reply streaming in the first instant after
  // startup; plain text is the least-bad stand-in there.
  return Markdown ? (
    <Markdown text={text} />
  ) : (
    <p className="whitespace-pre-wrap">{text}</p>
  );
}

export { RichText };
