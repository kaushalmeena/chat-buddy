import type { ProviderTurn } from "@/domain/message.ts";

import { clean, normalise, titleCase } from "./text.ts";

/**
 * What the engine has learned about the person in this conversation.
 *
 * Derived, never stored: it is recomputed from the transcript on every turn, so it
 * is exactly as private and as durable as the chat itself — clear the chat and it
 * is gone, switch threads and each has its own.
 */
export type Memory = {
  readonly name?: string;
  readonly age?: number;
  readonly place?: string;
  readonly job?: string;
  readonly likes: readonly string[];
  readonly dislikes: readonly string[];
  readonly favorites: Readonly<Record<string, string>>;
  readonly pets: readonly string[];
  readonly mood?: string;
};

/** Words that follow "I am" but are states, not names. */
const NOT_A_NAME =
  /^(?:a|an|the|so|very|not|just|fine|good|great|ok|okay|tired|sad|happy|bored|here|back|sure|sorry|done|busy|hungry|sick|lost|confused|new|from|in|at|feeling|going|trying|looking|working|really|still|also)$/;

/** The bot's own question asking for a name; an answer to it is a name. */
export const ASKS_NAME = /what should i call you|what is your name\?/i;

/** Moods the engine recognises, mapped to how it should respond. */
export const MOODS: Readonly<Record<string, "low" | "high">> = {
  sad: "low",
  down: "low",
  tired: "low",
  exhausted: "low",
  stressed: "low",
  anxious: "low",
  worried: "low",
  lonely: "low",
  bored: "low",
  angry: "low",
  upset: "low",
  frustrated: "low",
  sick: "low",
  depressed: "low",
  overwhelmed: "low",
  meh: "low",
  bad: "low",
  terrible: "low",
  awful: "low",
  happy: "high",
  great: "high",
  good: "high",
  excited: "high",
  fine: "high",
  awesome: "high",
  amazing: "high",
  fantastic: "high",
  wonderful: "high",
  glad: "high",
  relaxed: "high",
  calm: "high",
  ok: "high",
  okay: "high",
};

const MOOD_WORDS = Object.keys(MOODS).join("|");

type Learner = (text: string, raw: string, memory: MutableMemory) => void;

type MutableMemory = {
  name?: string;
  age?: number;
  place?: string;
  job?: string;
  likes: string[];
  dislikes: string[];
  favorites: Record<string, string>;
  pets: string[];
  mood?: string;
};

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Takes a name from the original casing when it was typed, else title-cases it. */
function nameFrom(raw: string, lowered: string): string | undefined {
  const words = clean(lowered).split(" ").slice(0, 2);
  const first = words[0];
  if (!first || NOT_A_NAME.test(first) || !/^\p{L}[\p{L}'-]*$/u.test(first))
    return undefined;
  const typed = raw.match(new RegExp(`\\b(${escape(words.join(" "))})\\b`, "iu"))?.[1];
  return typed && typed !== typed.toLowerCase() ? typed : titleCase(words.join(" "));
}

function addUnique(list: string[], item: string): void {
  const value = clean(item);
  if (value.length === 0 || value.length > 40) return;
  const index = list.indexOf(value);
  if (index !== -1) list.splice(index, 1);
  list.push(value);
}

/** "hiking, chess and jazz" → ["hiking", "chess", "jazz"]. */
export function splitList(phrase: string): string[] {
  return phrase
    .split(/,\s*(?:and\s+)?|\s+and\s+/)
    .map((item) => clean(item))
    .filter((item) => item.length > 0);
}

function removeItem(list: string[], item: string): void {
  const index = list.indexOf(clean(item));
  if (index !== -1) list.splice(index, 1);
}

const LEARNERS: readonly Learner[] = [
  (text, raw, memory) => {
    const match = text.match(
      /\b(?:my name is|call me|i am called|name is|they call me)\s+([\p{L}'-]+(?:\s[\p{L}'-]+)?)/u,
    );
    const name = match?.[1] && nameFrom(raw, match[1]);
    if (name) memory.name = name;
  },
  (text, _raw, memory) => {
    const match = text.match(
      /\bi am (\d{1,3})(?: years? old)?\b(?!\s*(?:%|percent|minutes|km|kg))/,
    );
    const age = match?.[1] ? Number(match[1]) : undefined;
    if (age !== undefined && age > 2 && age < 120) memory.age = age;
  },
  (text, raw, memory) => {
    const match = text.match(
      /\bi (?:live in|am from|come from|grew up in|moved to)\s+([^.,!?]+)/,
    );
    if (!match?.[1]) return;
    const place = clean(match[1]);
    const typed = raw.match(new RegExp(escape(place), "iu"))?.[0];
    memory.place = typed && typed !== typed.toLowerCase() ? typed : titleCase(place);
  },
  (text, _raw, memory) => {
    const match = text.match(
      /\b(?:i work as|my job is|i am working as)\s+(?:an? )?([^.,!?]+)/,
    );
    if (match?.[1]) memory.job = clean(match[1]);
  },
  (text, _raw, memory) => {
    for (const match of text.matchAll(
      /\bi (?:really |also |do )?(?:like|love|enjoy|adore)\s+([^.!?]+?)(?:\s+(?:but|because|so)\b|[.!?]|$)/g,
    )) {
      if (!match[1] || /^(?:you|it|that|this|them|to)\b/.test(match[1])) continue;
      for (const item of splitList(match[1])) {
        addUnique(memory.likes, item);
        removeItem(memory.dislikes, item);
      }
    }
  },
  (text, _raw, memory) => {
    for (const match of text.matchAll(
      /\bi (?:really )?(?:hate|dislike|do not like|cannot stand)\s+([^.!?]+?)(?:\s+(?:but|because|so)\b|[.!?]|$)/g,
    )) {
      if (!match[1] || /^(?:you|it|that|this|them|to)\b/.test(match[1])) continue;
      for (const item of splitList(match[1])) {
        addUnique(memory.dislikes, item);
        removeItem(memory.likes, item);
      }
    }
  },
  (text, _raw, memory) => {
    for (const match of text.matchAll(/\bmy favorite ([a-z ]{2,20}?) is ([^.,!?]+)/g)) {
      if (match[1] && match[2]) memory.favorites[clean(match[1])] = clean(match[2]);
    }
  },
  (text, raw, memory) => {
    const match = text.match(
      /\bi have an? (dog|cat|puppy|kitten|parrot|bird|hamster|rabbit|bunny|fish|turtle|horse)(?:\s+(?:named|called)\s+([\p{L}'-]+))?/u,
    );
    if (!match?.[1]) return;
    const name = match[2] ? nameFrom(raw, match[2]) : undefined;
    const pet = name ? `a ${match[1]} called ${name}` : `a ${match[1]}`;
    if (!memory.pets.includes(pet)) memory.pets.push(pet);
  },
  (text, _raw, memory) => {
    const match = text.match(
      new RegExp(
        `\\bi (?:am|feel|am feeling)(?: (?:so|very|really|a bit|kind of|pretty))? (${MOOD_WORDS})\\b`,
      ),
    );
    if (match?.[1]) memory.mood = match[1];
  },
];

/**
 * Reads the transcript from the start and learns from each of the person's
 * messages. Later statements win, so "I live in Pune" then "I moved to Delhi"
 * remembers Delhi.
 */
export function remember(turns: readonly ProviderTurn[]): Memory {
  const memory: MutableMemory = { likes: [], dislikes: [], favorites: {}, pets: [] };
  let previousBot = "";

  for (const turn of turns) {
    if (turn.role === "assistant") {
      previousBot = turn.content;
      continue;
    }

    const text = normalise(turn.content);

    // A short reply straight after "What should I call you?" is the name itself.
    if (ASKS_NAME.test(previousBot) && text.split(" ").length <= 3) {
      const name = nameFrom(
        turn.content,
        text.replace(/^(?:it is|i am|call me|just)\s+/, ""),
      );
      if (name) memory.name = name;
    }

    for (const learn of LEARNERS) learn(text, turn.content, memory);
    previousBot = "";
  }

  return memory;
}

/** True when the memory holds anything worth reciting. */
export function knowsAnything(memory: Memory): boolean {
  return (
    memory.name !== undefined ||
    memory.age !== undefined ||
    memory.place !== undefined ||
    memory.job !== undefined ||
    memory.likes.length > 0 ||
    memory.dislikes.length > 0 ||
    memory.pets.length > 0 ||
    Object.keys(memory.favorites).length > 0
  );
}
