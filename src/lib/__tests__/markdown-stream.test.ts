import { describe, expect, it } from "vitest";
import { toRenderableMarkdown } from "../markdown-stream.ts";

describe("toRenderableMarkdown", () => {
  it("passes complete markdown through untouched", () => {
    for (const input of [
      "Plain prose.",
      "Some **bold** and *italic* and `code`.",
      "A [link](https://example.com).",
      "```ts\nconst x = 1;\n```",
      "| A | B |\n| - | - |\n| 1 | 2 |\n",
      "",
    ]) {
      expect(toRenderableMarkdown(input)).toBe(input);
    }
  });

  describe("code fences", () => {
    it("closes an open fence so code renders while still arriving", () => {
      expect(toRenderableMarkdown("```ts\nconst x =")).toBe("```ts\nconst x =\n```");
    });

    it("does not add a second newline when one is already there", () => {
      expect(toRenderableMarkdown("```\ncode\n")).toBe("```\ncode\n```");
    });

    it("closes a tilde fence with tildes", () => {
      expect(toRenderableMarkdown("~~~\ncode")).toBe("~~~\ncode\n~~~");
    });

    it("leaves a balanced fence alone even with prose after it", () => {
      const input = "```\ncode\n```\nAfter.";
      expect(toRenderableMarkdown(input)).toBe(input);
    });

    it("treats the bare opening fence as an open block", () => {
      expect(toRenderableMarkdown("```")).toBe("```\n```");
    });

    it("does not sanitise markdown syntax inside an open fence", () => {
      // Asterisks in code are literal; truncating them would corrupt the code.
      expect(toRenderableMarkdown("```\na ** b")).toBe("```\na ** b\n```");
    });
  });

  describe("emphasis", () => {
    it("hides an unpaired bold marker", () => {
      expect(toRenderableMarkdown("Some **bo")).toBe("Some ");
    });

    it("hides an unpaired italic marker", () => {
      expect(toRenderableMarkdown("Some *ital")).toBe("Some ");
    });

    it("hides an unpaired underscore marker", () => {
      expect(toRenderableMarkdown("Some _ital")).toBe("Some ");
    });

    it("hides an unpaired strikethrough marker", () => {
      expect(toRenderableMarkdown("Some ~~stru")).toBe("Some ");
    });

    it("keeps a complete bold span and hides only what follows it", () => {
      expect(toRenderableMarkdown("**done** then **par")).toBe("**done** then ");
    });

    it("does not mistake a complete bold span for two italic markers", () => {
      const input = "**bold**";
      expect(toRenderableMarkdown(input)).toBe(input);
    });

    it("handles bold and italic together", () => {
      const input = "**bold** and *it*";
      expect(toRenderableMarkdown(input)).toBe(input);
    });
  });

  describe("inline code", () => {
    it("hides an unpaired backtick", () => {
      expect(toRenderableMarkdown("Run `npm ru")).toBe("Run ");
    });

    it("keeps a complete span and hides a following partial one", () => {
      expect(toRenderableMarkdown("`a` then `b")).toBe("`a` then ");
    });

    it("ignores emphasis markers inside inline code", () => {
      // The asterisks are code, so nothing is unpaired and nothing is cut.
      const input = "use `a ** b` here";
      expect(toRenderableMarkdown(input)).toBe(input);
    });
  });

  describe("links and images", () => {
    it("hides a link still in its label", () => {
      expect(toRenderableMarkdown("See [the do")).toBe("See ");
    });

    it("hides a link still in its destination", () => {
      expect(toRenderableMarkdown("See [docs](https://exa")).toBe("See ");
    });

    it("hides an image still being written", () => {
      expect(toRenderableMarkdown("![a ca")).toBe("");
    });

    it("keeps a complete link and hides a following partial one", () => {
      expect(toRenderableMarkdown("[a](x) and [b](y")).toBe("[a](x) and ");
    });
  });

  describe("tables", () => {
    it("holds back a row until its newline arrives", () => {
      const input = "| A | B |\n| - | - |\n| 1 | 2";
      expect(toRenderableMarkdown(input)).toBe("| A | B |\n| - | - |");
    });

    it("keeps rows that are already terminated", () => {
      const input = "| A | B |\n| - | - |\n| 1 | 2 |\n";
      expect(toRenderableMarkdown(input)).toBe(input);
    });
  });

  describe("progressive reveal", () => {
    it("never emits a stray syntax character at any prefix length", () => {
      const source = [
        "## Results",
        "",
        "The **fastest** option is `web-llm`, see [docs](https://x.dev).",
        "",
        "| A | B |",
        "| - | - |",
        "| 1 | 2 |",
        "",
        "```js",
        "const x = 1;",
        "```",
        "",
        "Done ~~not~~ *really*.",
      ].join("\n");

      for (let length = 0; length <= source.length; length += 1) {
        const rendered = toRenderableMarkdown(source.slice(0, length));

        // Every fence must be paired.
        const fences = rendered.match(/^ {0,3}(`{3,}|~{3,})/gm) ?? [];
        expect(
          fences.length % 2,
          `fences at ${length}: ${JSON.stringify(rendered)}`,
        ).toBe(0);

        // Outside code, no marker may be left unpaired.
        const outsideCode = rendered
          .replace(/(`{3,}|~{3,})[\s\S]*?\1/g, "")
          .replace(/`[^`\n]*`/g, "");

        for (const marker of ["**", "~~"]) {
          const count = outsideCode.split(marker).length - 1;
          expect(count % 2, `${marker} at ${length}: ${JSON.stringify(rendered)}`).toBe(
            0,
          );
        }

        const backticks = outsideCode.split("`").length - 1;
        expect(backticks % 2, `backtick at ${length}`).toBe(0);

        // No dangling link bracket.
        expect(outsideCode, `link at ${length}`).not.toMatch(/\[[^\]]*$/);
      }
    });

    it("returns the full source once every character has arrived", () => {
      const source = "All **done** with `code` and [a link](https://x.dev).";
      expect(toRenderableMarkdown(source)).toBe(source);
    });

    it("only ever returns a prefix, or the input plus a closing fence", () => {
      const source = "Text **bold** `code` [link](url) more";
      for (let length = 0; length <= source.length; length += 1) {
        const partial = source.slice(0, length);
        const rendered = toRenderableMarkdown(partial);
        // Nothing is invented: the result is a prefix of what arrived.
        expect(partial.startsWith(rendered)).toBe(true);
      }
    });
  });
});
