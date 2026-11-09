import { Check, Copy } from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";

const COPY_FEEDBACK_MS = 1600;

type CodeBlockProps = {
  readonly code: string;
  readonly language: string | undefined;
};

/**
 * A fenced code block: language label, copy button, and syntax highlighting.
 *
 * The highlighter is a separate chunk imported on first use, so replies without
 * code never load it. Until it arrives — and for languages it does not know — the
 * code renders as plain text, which has identical metrics, so highlighting only
 * recolours and never moves anything.
 */
function CodeBlock({ code, language }: CodeBlockProps) {
  // While a reply streams the code grows every frame; highlight the settled value.
  const deferred = useDeferredValue(code);
  const [highlighted, setHighlighted] = useState<{ source: string; html: string }>();

  useEffect(() => {
    let isCurrent = true;
    void import("@/lib/highlight.ts").then(({ highlight }) => {
      const html = highlight(deferred, language);
      if (isCurrent && html !== undefined) setHighlighted({ source: deferred, html });
      return undefined;
    });
    return () => {
      isCurrent = false;
    };
  }, [deferred, language]);

  // Only show highlighting that matches the current text; otherwise plain.
  const html = highlighted?.source === code ? highlighted.html : undefined;

  return (
    <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-raised">
      <div className="flex h-9 items-center justify-between border-b border-border-subtle pr-1 pl-3">
        <span className="font-mono text-xs text-content-faint">
          {language ?? "code"}
        </span>
        <CopyCode code={code} />
      </div>
      <pre className="scrollbar-slim overflow-x-auto px-3.5 py-3">
        {html === undefined ? (
          <code>{code}</code>
        ) : (
          // Safe: highlight.js escapes the code and adds only its own spans.
          // oxlint-disable-next-line react/no-danger
          <code dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </pre>
    </div>
  );
}

function CopyCode({ code }: { readonly code: string }) {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), COPY_FEEDBACK_MS);
    } catch {
      // Clipboard denied: nothing useful to show.
    }
  };

  const handleClick = () => {
    void handleCopy();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-content-muted transition-colors hover:bg-surface hover:text-content pointer-coarse:h-10"
    >
      {isCopied ? (
        <Check size={13} className="text-success" aria-hidden />
      ) : (
        <Copy size={13} aria-hidden />
      )}
      {isCopied ? "Copied" : "Copy"}
    </button>
  );
}

export { CodeBlock };
