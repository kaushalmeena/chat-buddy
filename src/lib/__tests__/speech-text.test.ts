import { describe, expect, it } from "vitest";
import { toSpeakableText, toUtteranceChunks } from "../speech-text.ts";

describe("toSpeakableText", () => {
  it("leaves plain prose alone", () => {
    expect(toSpeakableText("Hello there, human.")).toBe("Hello there, human.");
  });

  it("strips emphasis markers but keeps the words", () => {
    expect(toSpeakableText("Some **bold**, *italic* and ~~struck~~ text.")).toBe(
      "Some bold, italic and struck text.",
    );
    expect(toSpeakableText("__strong__ and _em_")).toBe("strong and em");
    expect(toSpeakableText("***both***")).toBe("both");
  });

  it("strips inline code backticks", () => {
    expect(toSpeakableText("Run `npm run dev` now.")).toBe("Run npm run dev now.");
  });

  it("replaces fenced code blocks rather than reading them", () => {
    const input = "Try this:\n\n```ts\nconst x: number = 1;\n```\n\nDone.";
    const spoken = toSpeakableText(input);

    expect(spoken).toContain("(code block)");
    expect(spoken).not.toContain("const");
    expect(spoken).not.toContain("```");
  });

  it("removes heading hashes", () => {
    expect(toSpeakableText("## Heading two")).toBe("Heading two");
    expect(toSpeakableText("###### Six")).toBe("Six");
  });

  it("keeps a link's label and drops its target", () => {
    expect(toSpeakableText("See [the docs](https://example.com/a/b).")).toBe(
      "See the docs.",
    );
  });

  it("keeps image alt text and drops the source", () => {
    expect(toSpeakableText("![a cat](https://example.com/cat.png)")).toBe("a cat");
  });

  it("does not read bare URLs aloud", () => {
    const spoken = toSpeakableText("Go to https://example.com/very/long/path now");
    expect(spoken).not.toContain("example.com");
    expect(spoken).toContain("link");
  });

  it("turns table rows into pauses and drops the divider row", () => {
    const input = ["| Engine | Size |", "| --- | --- |", "| Nano | 0 |"].join("\n");
    const spoken = toSpeakableText(input);

    expect(spoken).not.toContain("|");
    expect(spoken).not.toContain("---");
    expect(spoken).toContain("Engine");
    expect(spoken).toContain("Nano");
  });

  it("announces task list state in words", () => {
    const spoken = toSpeakableText("- [x] shipped\n- [ ] pending");
    expect(spoken).toContain("done: shipped");
    expect(spoken).toContain("not done: pending");
  });

  it("removes list markers", () => {
    expect(toSpeakableText("- one\n- two")).toBe("one two");
    expect(toSpeakableText("1. first\n2. second")).toBe("first second");
  });

  it("removes blockquote markers", () => {
    expect(toSpeakableText("> quoted words")).toBe("quoted words");
  });

  it("removes horizontal rules", () => {
    expect(toSpeakableText("before\n\n---\n\nafter")).toBe("before. after");
  });

  it("treats a paragraph break as a sentence boundary", () => {
    expect(toSpeakableText("First para.\n\nSecond para.")).toBe(
      "First para. Second para.",
    );
  });

  it("returns an empty string when nothing speakable remains", () => {
    expect(toSpeakableText("")).toBe("");
    expect(toSpeakableText("   \n\n  ")).toBe("");
  });

  it("does not leave a sentence end butted against a comma", () => {
    // Table and list substitutions routinely produce ".," which reads as a
    // stumbled double pause.
    const spoken = toSpeakableText("See [docs](https://x.dev).\n\n| A | B |");

    expect(spoken).not.toContain(".,");
    expect(spoken).not.toContain(",.");
  });

  it("does not leave markdown punctuation in a realistic mixed reply", () => {
    const input = [
      "## Results",
      "",
      "The **fastest** option is `web-llm`, see [docs](https://x.dev).",
      "",
      "| A | B |",
      "| - | - |",
      "| 1 | 2 |",
      "",
      "```js",
      "ignored();",
      "```",
    ].join("\n");

    const spoken = toSpeakableText(input);

    // The whole point: none of the syntax characters survive to the synthesiser.
    for (const marker of ["#", "**", "`", "](", "|", "http"]) {
      expect(spoken).not.toContain(marker);
    }
    expect(spoken).toContain("fastest");
    expect(spoken).toContain("docs");
  });
});

describe("toUtteranceChunks", () => {
  it("returns a single chunk for short text", () => {
    expect(toUtteranceChunks("Short enough.")).toEqual(["Short enough."]);
  });

  it("returns nothing for empty text", () => {
    expect(toUtteranceChunks("")).toEqual([]);
  });

  it("splits on sentence boundaries", () => {
    const text = `${"a".repeat(100)}. ${"b".repeat(100)}.`;
    const chunks = toUtteranceChunks(text, 120);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.endsWith(".")).toBe(true);
  });

  it("keeps every chunk within the limit", () => {
    const text = Array.from({ length: 12 }, (_, i) => `Sentence number ${i}.`).join(
      " ",
    );
    for (const chunk of toUtteranceChunks(text, 60)) {
      expect(chunk.length).toBeLessThanOrEqual(60);
    }
  });

  it("breaks an over-long single sentence on word boundaries", () => {
    const text = `${"word ".repeat(60).trim()}.`;
    const chunks = toUtteranceChunks(text, 50);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(50);
      // No chunk may start or end mid-word.
      expect(chunk).not.toMatch(/^\S*wor$|^ord\b/);
    }
  });

  it("loses no words when splitting", () => {
    const text = Array.from({ length: 20 }, (_, i) => `Sentence ${i}.`).join(" ");
    const rejoined = toUtteranceChunks(text, 40).join(" ");
    expect(rejoined.split(/\s+/)).toEqual(text.split(/\s+/));
  });
});
