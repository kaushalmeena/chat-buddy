import { lazy, Suspense } from "react";

/**
 * Markdown, loaded on demand.
 *
 * react-markdown and the unified/remark/micromark stack behind it are the largest
 * dependency the shell has, and nothing on first paint needs them: an empty thread
 * renders no assistant text at all. Splitting them out keeps the entry bundle small
 * so the app opens fast; `preloadRichText` warms the chunk once the browser is idle,
 * so by the time a reply arrives it is almost always already there.
 *
 * Until it loads, text renders as plain pre-wrapped prose — readable, and close
 * enough in shape that the swap does not jump.
 */
const loadMarkdown = () => import("./markdown.tsx");

const Markdown = lazy(async () => {
  const module = await loadMarkdown();
  return { default: module.Markdown };
});

export function preloadRichText(): void {
  void loadMarkdown();
}

function RichText({ text }: { readonly text: string }) {
  return (
    <Suspense fallback={<p className="whitespace-pre-wrap">{text}</p>}>
      <Markdown text={text} />
    </Suspense>
  );
}

export { RichText };
