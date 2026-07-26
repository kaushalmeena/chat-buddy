import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders assistant output as markdown.
 *
 * [react-markdown](https://github.com/remarkjs/react-markdown) rather than a
 * hand-rolled parser: it covers the full CommonMark grammar plus GFM tables,
 * strikethrough and task lists, which small models do emit and a bespoke subset
 * parser would silently mangle.
 *
 * It is also the safe choice by construction. react-markdown builds a syntax tree
 * and renders React elements from it — it never touches `innerHTML`, and raw HTML
 * in the source is escaped unless `rehype-raw` is added, which it deliberately is
 * not here. Model output is untrusted input, and the original app's habit of
 * interpolating remote strings straight into `innerHTML` is exactly the bug worth
 * not reproducing.
 */

/**
 * Element overrides.
 *
 * Most styling comes from the `.message-prose` class in `global.css`, which keeps
 * the theme tokens authoritative. Only elements needing structure rather than
 * colour are overridden here.
 */
const COMPONENTS: Components = {
  // Links in generated text point wherever the model decided. `noopener` and
  // `noreferrer` are mandatory, and opening in a new tab avoids losing the chat.
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow">
      {children}
    </a>
  ),

  // Tables need to scroll on their own rather than widening the bubble.
  table: ({ children }) => (
    <div className="scrollbar-slim -mx-1 overflow-x-auto px-1">
      <table>{children}</table>
    </div>
  ),
};

const PLUGINS = [remarkGfm];

type MarkdownProps = {
  readonly text: string;
};

/**
 * Memoised on `text`. During streaming this re-parses once per committed slice,
 * and memoising stops every other bubble in the transcript re-parsing with it.
 */
const Markdown = memo(function Markdown({ text }: MarkdownProps) {
  return (
    <ReactMarkdown remarkPlugins={PLUGINS} components={COMPONENTS}>
      {text}
    </ReactMarkdown>
  );
});

export { Markdown };
