import type { ProviderTurn } from "@/domain/message.ts";

import { PERSONA_FAVORITES, RIDDLES, WOULD_YOU_RATHER } from "./corpus.ts";
import {
  askRiddle,
  type Context,
  FALLBACKS,
  type Intent,
  INTENTS,
  OFFER_FACT,
  OFFER_JOKE,
  OFFER_RIDDLE,
  OFFER_TALK,
  REFLECTIONS,
  type Reply,
  tellFact,
  tellJoke,
} from "./intents.ts";
import { ASKS_NAME, MOODS, remember } from "./memory.ts";
import { arithmetic, chance, clock } from "./skills.ts";
import { normalise, pick, type RandomSource } from "./text.ts";

export type ReplyOptions = {
  readonly random?: RandomSource;
  readonly now?: Date;
};

/**
 * Chat Buddy's built-in conversation engine: the whole transcript in, one reply
 * out.
 *
 * It holds no state. Everything that makes it feel like a conversation — what it
 * knows about the person, the riddle it just asked, the joke it offered, the topic
 * a "why?" refers to — is re-read from the transcript each turn. That keeps it
 * deterministic for a given history and random source, and means memory lives
 * exactly as long as the chat does.
 */
export function reply(
  turns: readonly ProviderTurn[],
  options: ReplyOptions = {},
): string {
  const context = buildContext(turns, options);
  if (context.text.length === 0) return "I'm listening.";

  return (
    continueFlow(context) ??
    arithmetic(context.text) ??
    clock(context.text, context.now) ??
    chance(context.text, context.random) ??
    firstReply(INTENTS, context) ??
    firstReply(REFLECTIONS, context) ??
    choose(FALLBACKS, context) ??
    "Tell me more."
  );
}

function buildContext(turns: readonly ProviderTurn[], options: ReplyOptions): Context {
  const userTurns = turns
    .filter((turn) => turn.role === "user")
    .map((turn) => turn.content);
  const lastUser = turns.findLastIndex((turn) => turn.role === "user");
  const before = lastUser === -1 ? [] : turns.slice(0, lastUser);

  return {
    raw: userTurns.at(-1) ?? "",
    text: normalise(userTurns.at(-1) ?? ""),
    memory: remember(turns),
    previousBot: before.findLast((turn) => turn.role === "assistant")?.content ?? "",
    previousUser: normalise(userTurns.at(-2) ?? ""),
    userTurns,
    said: new Set(
      turns.filter((turn) => turn.role === "assistant").map((turn) => turn.content),
    ),
    random: options.random ?? Math.random,
    now: options.now ?? new Date(),
  };
}

function choose(options: Reply, context: Context): string | undefined {
  if (options === undefined) return undefined;
  if (typeof options === "string") return options;
  return pick(options, context.said, context.random);
}

/** The first intent that matches and has something to say. */
function firstReply(intents: readonly Intent[], context: Context): string | undefined {
  for (const intent of intents) {
    for (const pattern of intent.patterns) {
      const match = context.text.match(pattern);
      if (!match) continue;
      const line = choose(intent.respond(context, match), context);
      if (line) return line;
    }
  }
  return undefined;
}

/** Which intent the person's previous message triggered — the current "topic". */
function previousIntent(context: Context): Intent | undefined {
  if (context.previousUser.length === 0) return undefined;
  return [...INTENTS, ...REFLECTIONS].find((intent) =>
    intent.patterns.some((pattern) => pattern.test(context.previousUser)),
  );
}

const YES =
  /^(?:yes|yeah|yep|yup|sure|ok|okay|go on|go ahead|why not|please|of course|absolutely|definitely|another|one more|more|y)\b/;
const NO = /^(?:no|nope|nah|not now|no thanks|maybe later|stop|n)\b/;
// Anchored: "tell me a joke" mid-riddle is a new request, not giving up.
const GIVE_UP =
  /\b(?:give up|i do not know|no idea|reveal|dunno|idk)\b|^(?:tell me|what is it)\??$|\btell me the answer\b/;

/**
 * True when the message is a request of its own — a skill or a recognised intent —
 * so an open riddle or game should step aside rather than read it as an answer.
 */
function isRequest(context: Context): boolean {
  const { text } = context;
  if (arithmetic(text) ?? clock(text, context.now) ?? chance(text, () => 0))
    return true;
  return INTENTS.some(
    (intent) =>
      intent.id !== "knowledge" &&
      intent.patterns.some((pattern) => pattern.test(text)),
  );
}

/*
 * Conversation flows: replies that only make sense given what the engine itself
 * just said. Checked before anything else, so "yes" after "Want another joke?"
 * gets a joke, and an answer to a riddle is marked rather than misread.
 */
function continueFlow(context: Context): string | undefined {
  const { text, previousBot } = context;

  // A riddle is open: the last bot message contains its question.
  const riddle = RIDDLES.find((item) => previousBot.includes(item.question));
  if (riddle && !isRequest(context)) {
    if (/\bhint\b/.test(text)) {
      const answer = riddle.answers[0] ?? "";
      return `Hint: it starts with "${answer.charAt(0)}" and has ${answer.length} letters. (${riddle.question})`;
    }
    if (riddle.answers.some((answer) => new RegExp(`\\b${answer}s?\\b`).test(text))) {
      return choose(
        [
          `Yes! ${riddle.reveal} Nicely done. ${OFFER_RIDDLE}`,
          `Correct — ${riddle.reveal.toLowerCase()} ${OFFER_RIDDLE}`,
        ],
        context,
      );
    }
    if (GIVE_UP.test(text) || NO.test(text)) {
      return `It's ${riddle.reveal.charAt(0).toLowerCase()}${riddle.reveal.slice(1)} ${OFFER_RIDDLE}`;
    }
    if (text.split(" ").length <= 4) {
      return `Not quite! Try again, say "hint", or "I give up". (${riddle.question})`;
    }
  }

  // A would-you-rather is open: pick a side and play along.
  const dilemma = WOULD_YOU_RATHER.find((question) => previousBot.includes(question));
  if (dilemma && !YES.test(text) && !NO.test(text) && !isRequest(context)) {
    const options = dilemma.match(/rather (.+?) or (.+?)\?/);
    const mine = options?.[context.random() < 0.5 ? 1 : 2];
    return mine
      ? `Good answer. I think I'd ${mine}. Want another one? Just say "would you rather".`
      : "Good answer!";
  }

  // An offer is open: "yes" accepts it, "no" declines.
  if (YES.test(text)) {
    if (previousBot.endsWith(OFFER_JOKE)) return tellJoke(context);
    if (previousBot.endsWith(OFFER_FACT)) return tellFact(context);
    if (previousBot.endsWith(OFFER_RIDDLE)) return askRiddle(context);
    if (previousBot.endsWith(OFFER_TALK)) return "I'm listening. What's going on?";
  }
  if (NO.test(text) && /\b(?:Want|want) (?:another|a|to)\b[^?]*\?$/.test(previousBot)) {
    return choose(
      [
        "No problem. What else is on your mind?",
        "Fair enough! What would you like to talk about?",
      ],
      context,
    );
  }

  // The engine asked for a name, and got one.
  if (
    ASKS_NAME.test(previousBot) &&
    context.memory.name &&
    text.split(" ").length <= 4
  ) {
    return choose(
      [
        `Nice to meet you, ${context.memory.name}!`,
        `${context.memory.name} — lovely. What's on your mind?`,
      ],
      context,
    );
  }

  // The engine asked how they are; a bare mood word is the answer.
  if (
    /how are you\?|how about you\?|how's your day|how is your day/i.test(previousBot)
  ) {
    const mood = Object.keys(MOODS).find((word) =>
      new RegExp(`\\b${word}\\b`).test(text),
    );
    const negated = /\b(?:not|never|hardly)\b/.test(text);
    if (mood) {
      const isLow = MOODS[mood] === "low" ? !negated : negated;
      // "Good, you?" asks back; answer that too.
      const askedBack = /\b(?:you|yourself)\??$/.test(text)
        ? "I'm doing well, thanks! "
        : "";
      const answer = isLow
        ? choose(
            [
              `Sorry to hear that. ${OFFER_TALK}`,
              "Hang in there. Anything I can do to help — a joke, maybe?",
            ],
            context,
          )
        : choose(
            [
              "Glad to hear it! What have you been up to?",
              "Nice! Anything fun planned?",
            ],
            context,
          );
      return answer === undefined ? undefined : `${askedBack}${answer}`;
    }
  }

  // "Why?", "tell me more", "really?" — about whatever we were just discussing.
  if (
    /^(?:why\??|how so\??|tell me more|go on|really\??|seriously\??|is that (?:so|true)\??|what do you mean\??)$/.test(
      text,
    )
  ) {
    const topic = previousIntent(context);
    if (topic?.more) return choose(topic.more, context);
    return choose(
      [
        "Honestly, that's about as deep as my built-in rules go. What do you think?",
        "It's just how I see it! What's your take?",
      ],
      context,
    );
  }

  // "And you?" — answer about ourselves on the same topic.
  if (/^(?:and |what about |how about )?(?:you|yours)\??$/.test(text)) {
    const favorite = context.previousUser.match(/\bfavorite ([a-z ]{2,20}?) is\b/)?.[1];
    const mine = favorite ? PERSONA_FAVORITES[favorite] : undefined;
    if (mine) return `Mine's ${mine}.`;
    if (/\b(?:my name|call me)\b/.test(context.previousUser)) return "I'm Chat Buddy!";
    if (/\b(?:i (?:am|feel)|doing)\b/.test(context.previousUser))
      return "I'm doing well, thanks for asking!";
    if (/\bi live in|i am from\b/.test(context.previousUser))
      return "I live right here in your browser.";
    return choose(
      [
        "Me? I'm just happy to be chatting.",
        "I'm a simple bot — but I'm enjoying this!",
      ],
      context,
    );
  }

  return undefined;
}
