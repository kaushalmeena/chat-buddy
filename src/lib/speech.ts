/**
 * Converts markdown into something worth listening to.
 *
 * Assistant replies are stored as raw markdown, and handing that straight to a
 * speech synthesiser makes it read the syntax aloud — "hash hash Heading",
 * "asterisk asterisk bold asterisk asterisk", every pipe in a table, and the full
 * text of every URL. The result is unintelligible, which is exactly what it
 * sounded like.
 *
 * This is a lossy, speech-specific transform, not a markdown renderer: the goal
 * is a sentence a person can follow, so structure that carries no meaning out
 * loud is dropped rather than described.
 */

/** Replacements applied in order. Order matters: fences before inline code. */
const TRANSFORMS: readonly (readonly [RegExp, string])[] = [
  // Fenced code blocks. Reading code aloud is never useful; say so and move on.
  [/```[\w-]*\n[\s\S]*?```/g, " (code block) "],
  [/```[\s\S]*?```/g, " (code block) "],

  // Images: keep the alt text, drop the URL.
  [/!\[([^\]]*)\]\([^)]*\)/g, "$1"],

  // Links: keep the label, drop the target. A spoken URL is noise.
  [/\[([^\]]+)\]\([^)]*\)/g, "$1"],

  // Bare URLs and autolinks.
  [/<https?:\/\/[^>]+>/g, " link "],
  [/\bhttps?:\/\/\S+/g, " link "],

  // Headings: the text still matters, the hashes do not.
  [/^\s{0,3}#{1,6}\s+/gm, ""],

  // Blockquote markers.
  [/^\s{0,3}>\s?/gm, ""],

  // Horizontal rules.
  [/^\s{0,3}([-*_])\s*(?:\1\s*){2,}$/gm, " "],

  // GFM task list checkboxes, before generic list markers strip the bullet.
  [/^(\s*)[-*+]\s+\[x\]\s+/gim, "$1done: "],
  [/^(\s*)[-*+]\s+\[ \]\s+/gim, "$1not done: "],

  // List markers. The pause from the sentence break is enough structure.
  [/^\s*[-*+]\s+/gm, ""],
  [/^\s*\d+[.)]\s+/gm, ""],

  // Table rows: turn cell separators into pauses and drop divider rows.
  [/^\s*\|?[\s:|-]*\|[\s:|-]*\|?\s*$/gm, ""],
  [/\s*\|\s*/g, ", "],

  // Inline code, emphasis, strikethrough: keep the words, drop the markers.
  [/`([^`]+)`/g, "$1"],
  [/(\*\*\*|___)(.+?)\1/g, "$2"],
  [/(\*\*|__)(.+?)\1/g, "$2"],
  [/(\*|_)(.+?)\1/g, "$2"],
  [/~~(.+?)~~/g, "$1"],

  // Leftover escapes.
  [/\\([\\`*_{}[\]()#+\-.!>])/g, "$1"],
];

/**
 * Strips markdown down to speakable prose.
 *
 * Returns an empty string when nothing speakable remains, so callers can skip
 * speaking entirely rather than uttering silence.
 */
export function toSpeakableText(markdown: string): string {
  let text = markdown;

  for (const [pattern, replacement] of TRANSFORMS) {
    text = text.replace(pattern, replacement);
  }

  const cleaned = text
    // Collapse the whitespace the substitutions left behind, but keep paragraph
    // breaks as sentence boundaries so the voice pauses in sensible places.
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    // Blank-ish lines become sentence breaks; a line left holding only whitespace
    // by an earlier substitution (a horizontal rule, say) counts as blank.
    .replace(/\n\s*\n\s*/g, "\n\n")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    // Tidy punctuation the substitutions can double up.
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/([.!?])(?:\s*[.!?])+/g, "$1")
    // A sentence end absorbs an adjacent comma in either order. Table and list
    // substitutions routinely butt the two together, and a synthesiser reads
    // ".," as a double pause.
    .replace(/,\s*([.!?])/g, "$1")
    .replace(/([.!?])\s*,/g, "$1")
    .replace(/([.,;:])\1+/g, "$1")
    // A leading separator is left behind whenever the source opened with a
    // heading or a rule.
    .replace(/^[\s.,;:!?]+/, "")
    .replace(/\s+/g, " ")
    .trim();

  // Punctuation with no words in it is worse than silence: a synthesiser given
  // "." will happily announce it.
  return /[\p{L}\p{N}]/u.test(cleaned) ? cleaned : "";
}

/**
 * Splits speakable text into utterance-sized pieces at sentence boundaries.
 *
 * Several speech engines truncate or silently fail on long utterances — Chrome's
 * are notorious for cutting off after a few hundred characters. Queueing shorter
 * utterances avoids that, and it also makes `cancel` feel immediate because at
 * most one short piece is ever mid-flight.
 */
export function toUtteranceChunks(text: string, maxLength = 180): string[] {
  if (text.length <= maxLength) return text.length > 0 ? [text] : [];

  // Split after sentence-ending punctuation, keeping the punctuation attached.
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current = "";

  const push = () => {
    const trimmed = current.trim();
    if (trimmed.length > 0) chunks.push(trimmed);
    current = "";
  };

  for (const sentence of sentences) {
    // A single sentence longer than the limit still has to be broken up; fall
    // back to word boundaries so no word is split in half.
    if (sentence.length > maxLength) {
      push();
      let line = "";
      for (const word of sentence.split(/\s+/)) {
        if (line.length + word.length + 1 > maxLength) {
          if (line.length > 0) chunks.push(line);
          line = word;
        } else {
          line = line.length > 0 ? `${line} ${word}` : word;
        }
      }
      if (line.length > 0) chunks.push(line);
      continue;
    }

    if (current.length + sentence.length + 1 > maxLength) push();
    current = current.length > 0 ? `${current} ${sentence}` : sentence;
  }

  push();

  return chunks;
}
