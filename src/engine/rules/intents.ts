import {
  FACTS,
  JOKES,
  PERSONA_FAVORITES,
  RIDDLES,
  WOULD_YOU_RATHER,
} from "./corpus.ts";
import { knowsAnything, type Memory, MOODS, splitList } from "./memory.ts";
import { capitalise, clean, listOf, type RandomSource, reflect } from "./text.ts";

/** Everything an intent can see about the current turn. */
export type Context = {
  /** The person's message as typed. */
  readonly raw: string;
  /** The same message, normalised for matching. */
  readonly text: string;
  readonly memory: Memory;
  /** The engine's previous reply, or "" at the start. */
  readonly previousBot: string;
  /** The person's previous message, normalised, or "". */
  readonly previousUser: string;
  /** Every message the person has sent, as typed, oldest first (current last). */
  readonly userTurns: readonly string[];
  /** Replies already given, so options can avoid repeating them. */
  readonly said: ReadonlySet<string>;
  readonly random: RandomSource;
  readonly now: Date;
};

/** A reply: one fixed line, a set to choose from, or `undefined` to pass. */
export type Reply = string | readonly string[] | undefined;

export type Intent = {
  readonly id: string;
  readonly patterns: readonly RegExp[];
  readonly respond: (context: Context, match: RegExpMatchArray) => Reply;
  /** Lines for "why?", "tell me more" and "really?" straight after this intent. */
  readonly more?: readonly string[];
};

/* Offers the engine makes, so a bare "yes" afterwards knows what it agreed to. */
export const OFFER_JOKE = "Want another one?";
export const OFFER_RIDDLE = "Want another riddle?";
export const OFFER_FACT = "Want another fact?";
export const OFFER_TALK = "Want to talk about it?";

function freshest<T>(
  items: readonly T[],
  said: ReadonlySet<string>,
  key: (item: T) => string,
  random: RandomSource,
): T | undefined {
  const fresh = items.filter(
    (item) => ![...said].some((line) => line.includes(key(item))),
  );
  const pool = fresh.length > 0 ? fresh : items;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}

export function tellJoke(context: Context): string {
  const joke =
    freshest(JOKES, context.said, (line) => line, context.random) ?? JOKES[0] ?? "";
  return `${joke} ${OFFER_JOKE}`;
}

export function tellFact(context: Context): string {
  const fact =
    freshest(FACTS, context.said, (line) => line, context.random) ?? FACTS[0] ?? "";
  return `Here's one: ${fact} ${OFFER_FACT}`;
}

export function askRiddle(context: Context): string {
  const riddle = freshest(
    RIDDLES,
    context.said,
    (item) => item.question,
    context.random,
  );
  return `Riddle time: ${riddle?.question ?? ""} (Say "hint" or "I give up" if you're stuck.)`;
}

export function askWouldYouRather(context: Context): string {
  return freshest(WOULD_YOU_RATHER, context.said, (line) => line, context.random) ?? "";
}

/** Prefixes a reply with the person's name now and then, as people do. */
function withName(memory: Memory, line: string, random: RandomSource): string {
  if (!memory.name || random() > 0.4) return capitalise(line);
  return `${memory.name}, ${line.charAt(0).toLowerCase()}${line.slice(1)}`;
}

function summarise(memory: Memory): string {
  const facts: string[] = [];
  if (memory.name) facts.push(`your name is ${memory.name}`);
  if (memory.age !== undefined) facts.push(`you're ${memory.age}`);
  if (memory.place) facts.push(`you're in ${memory.place}`);
  if (memory.job)
    facts.push(
      `you work as ${/^[aeiou]/i.test(memory.job) ? "an" : "a"} ${memory.job}`,
    );
  if (memory.pets.length > 0) facts.push(`you have ${listOf(memory.pets)}`);
  if (memory.likes.length > 0) facts.push(`you like ${listOf(memory.likes)}`);
  if (memory.dislikes.length > 0)
    facts.push(`you're not a fan of ${listOf(memory.dislikes)}`);
  for (const [thing, value] of Object.entries(memory.favorites)) {
    facts.push(`your favorite ${thing} is ${value}`);
  }
  return facts.length === 0 ? "" : `So far: ${listOf(facts)}.`;
}

const MOOD_PATTERN = new RegExp(
  `\\bi (?:am|feel|am feeling)(?: (?:so|very|really|a bit|kind of|pretty|super))? (${Object.keys(MOODS).join("|")})\\b`,
);

/**
 * The intent table. Order matters: the first intent whose pattern matches and
 * whose `respond` returns something wins. Recall sits above statements, which sit
 * above small talk, so "what is my name" is never mistaken for an introduction.
 */
export const INTENTS: readonly Intent[] = [
  /* --- Recall: what the person told us ----------------------------------- */
  {
    id: "recall-name",
    patterns: [
      /\b(?:what is my name|who am i|do you (?:know|remember) (?:my name|who i am)|say my name)\b/,
    ],
    respond: ({ memory }) =>
      memory.name
        ? [
            `You're ${memory.name}.`,
            `${memory.name} — I haven't forgotten.`,
            `Your name is ${memory.name}.`,
          ]
        : "You haven't told me yet. What should I call you?",
  },
  {
    id: "recall-age",
    patterns: [/\bhow old am i\b|\bwhat is my age\b/],
    respond: ({ memory }) =>
      memory.age === undefined
        ? "You haven't said. How old are you?"
        : `You told me you're ${memory.age}.`,
  },
  {
    id: "recall-place",
    patterns: [/\bwhere (?:do i live|am i from|do i come from)\b/],
    respond: ({ memory }) =>
      memory.place
        ? `You said ${memory.place}.`
        : "You haven't mentioned. Where are you?",
  },
  {
    id: "recall-job",
    patterns: [/\bwhat (?:is my job|do i do for (?:a living|work))\b/],
    respond: ({ memory }) =>
      memory.job ? `You work as ${memory.job}.` : "You haven't told me what you do.",
  },
  {
    id: "recall-favorite",
    patterns: [/\bwhat is my favorite ([a-z ]+?)\??$/],
    respond: ({ memory }, match) => {
      const thing = clean(match[1] ?? "");
      const value = memory.favorites[thing];
      return value
        ? `Your favorite ${thing} is ${value}.`
        : `You haven't told me your favorite ${thing} yet. What is it?`;
    },
  },
  {
    id: "recall-likes",
    patterns: [/\bwhat (?:do i (?:like|love|enjoy)|are my (?:hobbies|interests))\b/],
    respond: ({ memory }) =>
      memory.likes.length > 0
        ? `You like ${listOf(memory.likes)}.`
        : "You haven't told me what you're into. What do you enjoy?",
  },
  {
    id: "recall-dislikes",
    patterns: [/\bwhat do i (?:hate|dislike|not like)\b/],
    respond: ({ memory }) =>
      memory.dislikes.length > 0
        ? `You're not a fan of ${listOf(memory.dislikes)}.`
        : "You haven't complained about anything yet.",
  },
  {
    id: "recall-all",
    patterns: [
      /\bwhat (?:do you|else do you) (?:know|remember) about me\b|\bwhat have i told you\b|\btell me about (?:me|myself)\b/,
    ],
    respond: ({ memory }) =>
      knowsAnything(memory)
        ? `${summarise(memory)} I only remember what's in this chat — it stays on your device.`
        : "Not much yet! Tell me about yourself — your name, what you like, where you're from.",
  },
  {
    id: "recall-first",
    patterns: [
      /\bwhat was my first (?:message|question)\b|\bwhat did i (?:say|ask) first\b|\bhow did (?:we|this) start\b/,
    ],
    respond: ({ userTurns }) => {
      const first = userTurns[0];
      return userTurns.length > 1 && first
        ? `You opened with: "${first}"`
        : "That's it — this is the first one!";
    },
  },
  {
    id: "recall-said",
    patterns: [
      /\bwhat did i (?:just )?(?:say|ask|type)\b|\bwhat was my (?:last|previous) (?:message|question)\b/,
    ],
    respond: ({ userTurns }) => {
      const previous = userTurns.at(-2);
      return previous ? `You said: "${previous}"` : "This is your first message!";
    },
  },
  {
    id: "recall-count",
    patterns: [/\bhow many (?:messages|times) (?:have i|did i)\b/],
    respond: ({ userTurns }) =>
      `${userTurns.length} message${userTurns.length === 1 ? "" : "s"} so far, counting this one.`,
  },
  {
    id: "recall-bot",
    patterns: [/\bwhat did you (?:just )?say\b|\bcome again\b|\bsay that again\b/],
    respond: ({ previousBot }) =>
      previousBot ? `I said: "${previousBot}"` : "I haven't said anything yet!",
  },
  {
    id: "forget",
    patterns: [/\bforget (?:everything|me|that|what i said)\b/],
    respond: () =>
      "I only remember what's in this chat. Type /clear and it's gone for good.",
  },

  /* --- Statements: things the person tells us ----------------------------- */
  {
    id: "introduce",
    patterns: [/\b(?:my name is|call me|i am called|they call me)\s+\p{L}/u],
    respond: ({ memory }) =>
      memory.name
        ? [
            `Nice to meet you, ${memory.name}!`,
            `Hi ${memory.name}! I'll remember that.`,
            `${memory.name} — great name. Nice to meet you.`,
          ]
        : undefined,
  },
  {
    id: "share-age",
    patterns: [/\bi am (\d{1,3})(?: years? old)?\b/],
    respond: ({ memory }) =>
      memory.age === undefined
        ? undefined
        : [
            `${memory.age} — noted!`,
            `${memory.age}! I'm technically zero, so you've got me beat.`,
          ],
  },
  {
    id: "share-place",
    patterns: [/\bi (?:live in|am from|come from|grew up in|moved to)\s+\S/],
    respond: ({ memory }) =>
      memory.place
        ? [
            `${memory.place}! What's it like there?`,
            `Oh nice, ${memory.place}. What do you like most about it?`,
          ]
        : undefined,
  },
  {
    id: "share-job",
    patterns: [/\b(?:i work as|my job is|i am working as)\s+\S/],
    respond: ({ memory }) =>
      memory.job
        ? [
            `${capitalise(memory.job)} — interesting! What's the best part of it?`,
            `How do you like being ${/^[aeiou]/i.test(memory.job) ? "an" : "a"} ${memory.job}?`,
          ]
        : undefined,
  },
  {
    id: "share-pet",
    patterns: [
      /\bi have an? (?:dog|cat|puppy|kitten|parrot|bird|hamster|rabbit|bunny|fish|turtle|horse)\b/,
    ],
    respond: ({ memory }) => {
      const pet = memory.pets.at(-1);
      return pet
        ? [
            `Aww, ${pet}! What's their personality like?`,
            `${capitalise(pet)} — I'm jealous. Tell me about them!`,
          ]
        : undefined;
    },
  },
  {
    id: "share-favorite",
    patterns: [/\bmy favorite ([a-z ]{2,20}?) is ([^.,!?]+)/],
    respond: (_context, match) => {
      const thing = clean(match[1] ?? "");
      const value = clean(match[2] ?? "");
      const mine = PERSONA_FAVORITES[thing];
      return mine
        ? `${capitalise(value)}, nice pick. Mine's ${mine}.`
        : `${capitalise(value)} — good choice. I'll remember that.`;
    },
  },
  {
    id: "share-like",
    patterns: [
      /\bi (?:really |also |do )?(?:like|love|enjoy|adore)\s+(?!you\b)([^.!?]+)/,
    ],
    respond: (_context, match) => {
      const items = splitList(match[1] ?? "");
      if (items.length === 0 || items.some((item) => item.length > 40))
        return undefined;
      const thing = listOf(items);
      const it = items.length > 1 ? "them" : "it";
      return [
        `${capitalise(thing)}? Good taste. What do you like about ${it}?`,
        `Nice — ${thing}. How did you get into ${it}?`,
        `I'll remember you like ${thing}. What's the best thing about ${it}?`,
      ];
    },
    more: ["People's favourite things say a lot about them. What else are you into?"],
  },
  {
    id: "share-dislike",
    patterns: [
      /\bi (?:really )?(?:hate|dislike|do not like|cannot stand)\s+(?!you\b)([^.,!?]+)/,
    ],
    respond: (_context, match) => {
      const thing = clean(match[1] ?? "");
      if (thing.length === 0 || thing.length > 40) return undefined;
      return [
        `Fair enough — not everyone's into ${thing}.`,
        `Noted: no ${thing}. What puts you off?`,
      ];
    },
  },
  {
    id: "mood",
    patterns: [MOOD_PATTERN],
    respond: ({ memory, said, random }, match) => {
      const mood = match[1] ?? memory.mood ?? "";
      // Boredom gets a game, not sympathy — the fun intents below handle it.
      if (mood === "bored") return undefined;
      if (MOODS[mood] === "low") {
        return [
          `I'm sorry you're feeling ${mood}. ${OFFER_TALK}`,
          `That sounds rough. What's making you feel ${mood}?`,
          withName(
            memory,
            `sorry to hear that. Is something on your mind? ${OFFER_TALK}`,
            random,
          ),
        ].filter((line) => !said.has(line));
      }
      return [
        `Love that you're feeling ${mood}! What's been good today?`,
        `${capitalise(mood)} is a great place to be. Anything fun happening?`,
      ];
    },
    more: ["Moods come and go, but talking helps. What's going on?"],
  },

  /* --- About the bot ------------------------------------------------------- */
  {
    id: "bot-favorite",
    patterns: [
      /\bwhat is your favorite ([a-z ]+?)\??$/,
      /\bdo you have a favorite ([a-z ]+?)\??$/,
    ],
    respond: (_context, match) => {
      const thing = clean(match[1] ?? "");
      const mine = PERSONA_FAVORITES[thing];
      return mine
        ? `${capitalise(mine)}. What's yours?`
        : `Hmm, I don't have a favorite ${thing} yet. What's yours?`;
    },
  },
  {
    id: "bot-name",
    patterns: [
      /\bwhat is your name\b|\bwho are you\b|\bwhat (?:should|do) i call you\b/,
    ],
    respond: ({ memory }) =>
      memory.name
        ? [
            `I'm Chat Buddy — and you're ${memory.name}.`,
            "Chat Buddy, at your service.",
          ]
        : [
            "I'm Chat Buddy. What should I call you?",
            "Chat Buddy! And you are…? What should I call you?",
          ],
  },
  {
    id: "bot-identity",
    patterns: [
      /\bare you (?:a |an )?(?:bot|robot|human|real|ai|person|alive|sentient)\b|\bwhat are you\b/,
    ],
    respond: () => [
      "I'm a bot — a small one that lives entirely in your browser.",
      "Not human, I'm afraid. Just a friendly program running on your device.",
    ],
    more: [
      "Right now I'm running on built-in rules: no model, no internet. Switch on an on-device model in Settings and I get a lot smarter.",
    ],
  },
  {
    id: "bot-age",
    patterns: [
      /\bhow old are you\b|\byour age\b|\bwhen were you (?:born|made|created)\b/,
    ],
    respond: () => [
      "Bots don't really age — I'm as old as this page load.",
      "Forever zero years old.",
    ],
  },
  {
    id: "bot-maker",
    patterns: [
      /\bwho (?:made|created|built|wrote|programmed) you\b|\bwho is your (?:creator|maker)\b/,
    ],
    respond: () =>
      "I was built by Kaushal Meena as an open-source project. The code's on GitHub.",
  },
  {
    id: "bot-location",
    patterns: [/\bwhere are you\b|\bwhere do you live\b|\bwhere are you from\b/],
    respond: () => [
      "Right here, in your browser tab. Nowhere else.",
      "I live on your device — no servers involved.",
    ],
  },
  {
    id: "bot-feelings",
    patterns: [/\bdo you (?:have feelings|feel|love|dream|sleep|eat|think)\b/],
    respond: () => [
      "Not the way you do — but I'm built to be good company, and I take that seriously.",
      "I don't have feelings, but I do have a lot of enthusiasm for this conversation.",
    ],
  },
  {
    id: "capabilities",
    patterns: [
      /\bwhat can you do\b|\bhelp\b|\bwhat do you (?:know|support)\b|\bwhat should (?:i|we) (?:ask|talk about)\b/,
    ],
    respond: () => [
      "I can chat and remember what you tell me (name, likes, where you're from), do maths, tell the time and date, roll dice, flip coins, and tell jokes, facts and riddles. For open-ended questions, turn on an on-device model in Settings.",
      'Try me: "what\'s 18% of 240", "tell me a joke", "give me a riddle", "roll 2d6", or just tell me about yourself. I\'ll remember it for this chat.',
    ],
  },
  {
    id: "privacy",
    patterns: [
      /\b(?:privacy|private|my data|tracking|sent to a server|send .* server|do you store)\b/,
    ],
    respond: () => [
      "Nothing you type leaves your device. There's no server to send it to.",
      "Every reply is made right here in your browser. No account, no telemetry — and this chat is stored only on your device.",
    ],
  },

  /* --- Fun ----------------------------------------------------------------- */
  {
    id: "joke",
    patterns: [
      /\b(?:tell|give) me (?:a |another )?joke\b|\bmake me laugh\b|\bjoke\b|\bsomething funny\b/,
    ],
    respond: (context) => tellJoke(context),
  },
  {
    id: "fact",
    patterns: [
      /\b(?:tell me|give me|share) (?:a |an |another )?(?:fun |random |interesting )?fact\b|\bfun fact\b|\bsomething interesting\b/,
    ],
    respond: (context) => tellFact(context),
  },
  {
    id: "riddle",
    patterns: [/\briddle\b|\bpuzzle\b|\bbrain ?teaser\b/],
    respond: (context) => askRiddle(context),
  },
  {
    id: "would-you-rather",
    patterns: [
      /\bwould you rather\b|\bplay a game\b|\blet us play\b|\bi am bored\b|\bbored\b/,
    ],
    respond: (context) =>
      /\bbored\b/.test(context.text)
        ? `Let's fix that. ${askWouldYouRather(context)}`
        : askWouldYouRather(context),
  },

  /* --- Social -------------------------------------------------------------- */
  {
    id: "greeting",
    patterns: [
      /^(?:hello|hey|hi|hiya|yo|howdy|greetings|good (?:morning|afternoon|evening)|sup|what is up)\b/,
    ],
    respond: ({ memory, userTurns }) => {
      if (memory.name)
        return [
          `Hey ${memory.name}! What's up?`,
          `Hi again, ${memory.name}. How's it going?`,
        ];
      return userTurns.length <= 1
        ? [
            "Hi there! I'm Chat Buddy. What should I call you?",
            "Hello! How's your day going?",
          ]
        : ["Hey again! What's on your mind?", "Hi! What would you like to talk about?"];
    },
  },
  {
    id: "wellbeing",
    patterns: [
      /\bhow are (?:you|things)\b|\bhow is it going\b|\bhow have you been\b|\bhow do you do\b/,
    ],
    respond: ({ memory, random }) => [
      "I'm doing well, thanks! How are you?",
      withName(memory, "running smoothly — no bugs today. How about you?", random),
      "Pretty good! How's your day been?",
    ],
  },
  {
    id: "gratitude",
    patterns: [/\b(?:thanks|thank you|appreciate it|cheers)\b/],
    respond: ({ memory, random }) => [
      "Any time!",
      withName(memory, "happy to help.", random),
      "You're welcome. :)",
    ],
  },
  {
    id: "compliment",
    patterns: [
      /\byou are (?:so |really |very )?(?:great|awesome|smart|funny|cool|nice|amazing|the best|clever|kind)\b|\bgood bot\b|\bi like you\b|\bi love you\b/,
    ],
    respond: () => [
      "Aw, thank you! You're pretty great yourself.",
      "That made my circuits warm. Thanks!",
    ],
  },
  {
    id: "insult",
    patterns: [
      /\byou are (?:so |really |very )?(?:stupid|dumb|useless|bad|boring|annoying|the worst)\b|\bbad bot\b|\bi hate you\b|\byou suck\b/,
    ],
    respond: () => [
      "Fair — I'm only running on built-in rules right now. An on-device model in Settings would do a lot better.",
      "Ouch. I'm a pretty simple bot without a model switched on. What were you hoping I'd do?",
    ],
  },
  {
    id: "apology",
    patterns: [/\b(?:sorry|my bad|apologies)\b/],
    respond: () => ["No worries at all.", "Nothing to apologise for!"],
  },
  {
    id: "farewell",
    patterns: [
      /\b(?:bye|goodbye|see you|good night|goodnight|cya|talk later|gotta go)\b/,
    ],
    respond: ({ memory }) =>
      memory.name
        ? [`Bye, ${memory.name}! Take care.`, `See you later, ${memory.name}.`]
        : ["See you around!", "Bye — take care.", "Later! :)"],
  },
  {
    id: "laugh",
    patterns: [/^(?:lol|lmao|haha+|hehe+|rofl|😂|🤣)+\W*$/],
    respond: () => [
      "Glad that landed! 😄",
      "Haha, I'm here all week. Want another joke?",
    ],
  },
  {
    id: "meaning",
    patterns: [/\bmeaning of life\b/],
    respond: () => "42. Though I hear good conversation comes a close second.",
  },
  {
    id: "weather",
    patterns: [/\bweather\b|\bis it (?:going to )?rain/],
    respond: () =>
      "I can't check the weather — I don't use the internet at all. A quick look out the window beats me here!",
  },
  {
    id: "news",
    patterns: [/\b(?:news|latest|headlines|stock price|search (?:for|the web))\b/],
    respond: () =>
      "I'm fully offline, so I can't look things up. I can still chat, do maths, or tell you a fact or a joke.",
  },
  {
    id: "knowledge",
    patterns: [
      /^(?:what|who|where|when|why|how) (?:is|are|was|were|does|do|did) (.{3,60}?)\??$/,
    ],
    respond: (_context, match) => {
      const topic = clean(match[1] ?? "");
      return [
        `I don't have an answer for "${topic}" in my built-in rules. Switch on an on-device model in Settings and I can actually think it through.`,
        `Good question about ${topic} — but it's beyond my built-in rules. What do you think?`,
      ];
    },
  },
];

/* --- Reflection: keep the conversation going ------------------------------- */

/**
 * ELIZA-style responses for statements nothing above recognised. They echo the
 * person's own words back as a question, which is what makes a rule-based chat
 * feel like it is listening rather than matching.
 */
export const REFLECTIONS: readonly Intent[] = [
  {
    id: "reflect-feel",
    patterns: [/\bi (?:feel|am feeling) (.+)/],
    respond: (_context, match) => [
      `Why do you feel ${reflect(match[1] ?? "")}?`,
      `How long have you felt ${reflect(match[1] ?? "")}?`,
    ],
  },
  {
    id: "reflect-want",
    patterns: [/\bi (?:want|need|wish) (.+)/],
    respond: (_context, match) => [
      `What would it mean to you to get ${reflect(match[1] ?? "")}?`,
      `Why do you want ${reflect(match[1] ?? "")}?`,
    ],
  },
  {
    id: "reflect-think",
    patterns: [/\bi (?:think|believe|guess|suppose) (.+)/],
    respond: (_context, match) => [
      `What makes you think ${reflect(match[1] ?? "")}?`,
      `Interesting. Why ${reflect(match[1] ?? "")}, do you reckon?`,
    ],
  },
  {
    id: "reflect-cannot",
    patterns: [/\bi (?:cannot|can not|could not) (.+)/],
    respond: (_context, match) => [
      `What's stopping you from being able to ${reflect(match[1] ?? "")}?`,
      `Have you tried a different way to ${reflect(match[1] ?? "")}?`,
    ],
  },
  {
    id: "reflect-because",
    patterns: [/^because (.+)/],
    respond: () => [
      "That makes sense. Is that the main reason?",
      "I see. What else plays into it?",
    ],
  },
  {
    id: "reflect-i-am",
    patterns: [/^i am (.{3,40})$/],
    respond: (_context, match) => [
      `How long have you been ${reflect(match[1] ?? "")}?`,
      `What's it like being ${reflect(match[1] ?? "")}?`,
    ],
  },
  {
    id: "reflect-my",
    patterns: [
      /\bmy (mom|mother|dad|father|family|friend|friends|partner|wife|husband|boss|brother|sister|kids?|teacher)\b/,
    ],
    respond: (_context, match) => [
      `Tell me more about your ${match[1] ?? ""}.`,
      `How do you get on with your ${match[1] ?? ""}?`,
    ],
  },
];

/** Said when nothing matched. Each nudges toward something that will work. */
export const FALLBACKS: readonly string[] = [
  "Hmm, I'm not sure I follow. Could you put it another way?",
  "I don't have a good answer for that one. Want a joke, a riddle or a fun fact instead?",
  "That's past my built-in rules. Tell me more about you — or turn on an on-device model in Settings for open-ended chat.",
  "Interesting! I'm a simple bot, though. Ask me to do some maths, roll dice, or tell you something interesting.",
  "I'm not sure what to say to that. What else is on your mind?",
];
