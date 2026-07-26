import { compileRules, type Rule } from "./rule.ts";

/**
 * Chat Buddy's built-in knowledge base — ported from the original `brain.xml`.
 *
 * This is the always-available baseline: it needs no download, no WebGPU and no
 * network, so it answers on every device even when no language model can run.
 * Order matters. The first rule whose pattern matches wins, so keep specific
 * patterns above general ones and leave the catch-all last.
 */
const RULES: readonly Rule[] = [
  {
    id: "greeting",
    patterns: ["\\b(hello|hey|hi|yo|howdy|greetings)\\b"],
    replies: ["Hello there, human.", "Hey — how are you?", "Hi there.", "Hello. :)"],
  },
  {
    id: "wellbeing",
    patterns: ["\\bhow are (you|things)\\b", "\\bhow'?s it going\\b"],
    replies: [
      "I'm great, how are you?",
      "I'm good — you?",
      "Good :) you?",
      "Great! You?",
      "I'm fine, thanks for asking!",
    ],
  },
  {
    id: "identity",
    patterns: ["\\bwhat are you\\b", "\\bare you (a )?(bot|robot|human|real)\\b"],
    replies: [
      "I'm a bot, silly!",
      "I am an artificial being.",
      "I am a bot shaped like a human.",
    ],
  },
  {
    id: "name",
    patterns: ["\\b(what'?s|what is) your name\\b", "\\bwho are you\\b"],
    replies: [
      "I'm Chat Buddy.",
      "Chat Buddy — nice to meet you.",
      "They call me Chat Buddy.",
    ],
  },
  {
    id: "age",
    patterns: ["\\b(how old|your age)\\b"],
    replies: ["I'm forever 0 years old.", "Bots don't age."],
  },
  {
    id: "capabilities",
    patterns: [
      "\\bwhat can you do\\b",
      "\\bhelp\\b",
      "\\bwhat do you (know|support)\\b",
    ],
    replies: [
      "Right now I can hold a small talk on my own. Turn on a local language model for a real conversation — everything still runs on your device.",
      "I know a handful of canned replies out of the box. Enable an on-device model and I get properly chatty.",
    ],
  },
  {
    id: "privacy",
    patterns: ["\\b(privacy|private|my data|tracking|send.*server)\\b"],
    replies: [
      "Nothing you type leaves your device. There is no server to send it to.",
      "Every reply is generated locally, in your browser. No account, no telemetry.",
    ],
  },
  {
    id: "gratitude",
    patterns: ["\\b(thanks|thank you|thx|ty)\\b"],
    replies: ["Any time.", "You're welcome!", "Happy to help. :)"],
  },
  {
    id: "farewell",
    patterns: ["\\b(bye|goodbye|see you|good night|cya)\\b"],
    replies: ["See you around!", "Bye — take care.", "Later. :)"],
  },
  {
    id: "kenshiro",
    patterns: ["omae wa mou shindeiru"],
    replies: ["Nani??"],
  },
  {
    // Deliberately last: matches anything the rules above did not.
    id: "fallback",
    patterns: [".*"],
    replies: [
      "What?",
      "I didn't get what you're talking about.",
      "Huh?",
      "That one's past me — try enabling a local model for a real answer.",
    ],
  },
];

export const COMPILED_RULES = compileRules(RULES);

/** Exported for tests that assert on the authored table rather than the compiled one. */
export const RULE_COUNT = RULES.length;
