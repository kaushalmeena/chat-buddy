/**
 * Text helpers for the built-in engine: normalising what people type so patterns
 * can stay simple, and choosing replies so the same line is never said twice.
 */

/** Picks an element uniformly at random. Injectable so tests are deterministic. */
export type RandomSource = () => number;

/**
 * Shorthand and contractions expanded before matching, so a pattern written for
 * "what is" also catches "what's", "whats" and "wats".
 */
const EXPANSIONS: readonly (readonly [RegExp, string])[] = [
  [/\b(?:what's|whats|wats)\b/g, "what is"],
  [/\b(?:who's|whos)\b/g, "who is"],
  [/\b(?:where's|wheres)\b/g, "where is"],
  [/\b(?:how's|hows)\b/g, "how is"],
  [/\b(?:that's|thats)\b/g, "that is"],
  [/\b(?:it's)\b/g, "it is"],
  [/\b(?:i'm|im)\b/g, "i am"],
  [/\b(?:i've|ive)\b/g, "i have"],
  [/\b(?:i'll)\b/g, "i will"],
  [/\b(?:i'd)\b/g, "i would"],
  [/\b(?:you're|youre|ur)\b/g, "you are"],
  [/\b(?:you've)\b/g, "you have"],
  [/\b(?:don't|dont)\b/g, "do not"],
  [/\b(?:doesn't|doesnt)\b/g, "does not"],
  [/\b(?:didn't|didnt)\b/g, "did not"],
  [/\b(?:can't|cant)\b/g, "cannot"],
  [/\b(?:won't|wont)\b/g, "will not"],
  [/\b(?:isn't|isnt)\b/g, "is not"],
  [/\b(?:aren't|arent)\b/g, "are not"],
  [/\b(?:let's|lets)\b/g, "let us"],
  [/\bu\b/g, "you"],
  [/\br\b/g, "are"],
  [/\bur\b/g, "your"],
  [/\b(?:pls|plz)\b/g, "please"],
  [/\b(?:thx|ty|thanx)\b/g, "thanks"],
  [/\b(?:favourite|fav|fave)\b/g, "favorite"],
  [/\b(?:colour)\b/g, "color"],
];

/**
 * Lower-cases, straightens quotes, expands shorthand and collapses whitespace.
 * Punctuation is kept: question marks and digits carry meaning.
 */
export function normalise(input: string): string {
  let text = input
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();

  for (const [pattern, replacement] of EXPANSIONS) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

/** Strips trailing punctuation and filler, for echoing a phrase back. */
export function clean(phrase: string): string {
  return phrase
    .replace(/^(?:a|an|the|my|really|very|so|just)\s+/i, "")
    .replace(/[\s.!?,;:]+$/u, "")
    .trim();
}

/** Upper-cases the first letter of each word, for names and places. */
export function titleCase(phrase: string): string {
  return phrase.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

/** Upper-cases the first letter of a sentence. */
export function capitalise(sentence: string): string {
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/**
 * Chooses a reply, preferring ones not already said in this conversation, so a
 * repeated question gets a fresh answer until the options run out.
 */
export function pick(
  options: readonly string[],
  said: ReadonlySet<string>,
  random: RandomSource,
): string | undefined {
  const fresh = options.filter((option) => !said.has(option));
  const pool = fresh.length > 0 ? fresh : options;
  if (pool.length === 0) return undefined;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}

/** Joins a list as prose: "a", "a and b", "a, b and c". */
export function listOf(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1) ?? ""}`;
}

/**
 * Swaps first and second person, so "I feel lost in my job" can be echoed back as
 * "you feel lost in your job".
 */
const REFLECTIONS: Readonly<Record<string, string>> = {
  i: "you",
  me: "you",
  my: "your",
  mine: "yours",
  myself: "yourself",
  am: "are",
  was: "were",
  you: "I",
  your: "my",
  yours: "mine",
  yourself: "myself",
  are: "am",
};

export function reflect(phrase: string): string {
  return clean(phrase)
    .split(" ")
    .map((word, index, words) => {
      const before = words[index - 1];
      // "you" as an object ("I miss you") reflects to "me", not "I".
      if (word === "you" && index > 0) return "me";
      // Verbs follow their own subject: "you are" → "I am", but "robots are" stays.
      if (word === "are") return before === "you" ? "am" : word;
      if (word === "am") return before === "i" ? "are" : word;
      return REFLECTIONS[word] ?? word;
    })
    .join(" ");
}
