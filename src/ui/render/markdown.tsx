import { Fragment, type JSX } from "preact";

/**
 * A deliberately small markdown subset renderer for assistant output.
 *
 * Model output is untrusted, and the original app's habit of interpolating remote
 * text straight into `innerHTML` is exactly the bug worth not reproducing. This
 * renderer never produces an HTML string: it returns Preact nodes, so anything
 * it does not recognise is escaped as text by construction.
 *
 * Supported, because it is what small chat models actually emit: fenced code
 * blocks, inline code, bold, italic, bullet and numbered lists, and paragraphs.
 */

type Block =
  | { readonly type: "paragraph"; readonly lines: readonly string[] }
  | { readonly type: "code"; readonly language: string; readonly code: string }
  | {
      readonly type: "list";
      readonly ordered: boolean;
      readonly items: readonly string[];
    };

const FENCE = /^```(\w*)\s*$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

/** Splits source text into blocks. A tiny state machine, not a real parser. */
function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.split("\n");

  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const fence = FENCE.exec(line);

    if (fence) {
      const language = fence[1] ?? "";
      const code: string[] = [];
      index += 1;

      while (index < lines.length && !FENCE.test(lines[index] ?? "")) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      // Skip the closing fence, if the model produced one.
      index += 1;

      blocks.push({ type: "code", language, code: code.join("\n") });
      continue;
    }

    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);

    if (bullet ?? numbered) {
      const ordered = bullet === null;
      const items: string[] = [];

      while (index < lines.length) {
        const candidate = lines[index] ?? "";
        const match = ordered ? NUMBERED.exec(candidate) : BULLET.exec(candidate);
        if (!match) break;
        items.push(match[1] ?? "");
        index += 1;
      }

      blocks.push({ type: "list", ordered, items });
      continue;
    }

    if (line.trim().length === 0) {
      index += 1;
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const candidate = lines[index] ?? "";
      if (
        candidate.trim().length === 0 ||
        FENCE.test(candidate) ||
        BULLET.test(candidate) ||
        NUMBERED.test(candidate)
      ) {
        break;
      }
      paragraph.push(candidate);
      index += 1;
    }

    blocks.push({ type: "paragraph", lines: paragraph });
  }

  return blocks;
}

/** Inline spans: `code`, **bold**, *italic*. Applied in that precedence order. */
const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g;

function renderInline(text: string): JSX.Element {
  const parts = text.split(INLINE);

  return (
    <>
      {parts.map((part, index) => {
        const key = `${index}-${part.slice(0, 8)}`;

        if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
          return <code key={key}>{part.slice(1, -1)}</code>;
        }
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
          return <strong key={key}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
          return <em key={key}>{part.slice(1, -1)}</em>;
        }
        if (part.startsWith("_") && part.endsWith("_") && part.length > 2) {
          return <em key={key}>{part.slice(1, -1)}</em>;
        }
        // Anything unrecognised stays literal text.
        return <Fragment key={key}>{part}</Fragment>;
      })}
    </>
  );
}

type MarkdownProps = {
  readonly text: string;
};

export function Markdown({ text }: MarkdownProps): JSX.Element {
  const blocks = parseBlocks(text);

  return (
    <>
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;

        switch (block.type) {
          case "code":
            return (
              <pre key={key}>
                <code data-language={block.language || undefined}>{block.code}</code>
              </pre>
            );
          case "list": {
            const items = block.items.map((item, itemIndex) => (
              <li key={`${key}-${itemIndex}`}>{renderInline(item)}</li>
            ));
            return block.ordered ? (
              <ol key={key}>{items}</ol>
            ) : (
              <ul key={key}>{items}</ul>
            );
          }
          case "paragraph":
            return <p key={key}>{renderInline(block.lines.join(" "))}</p>;
          default:
            return null;
        }
      })}
    </>
  );
}
