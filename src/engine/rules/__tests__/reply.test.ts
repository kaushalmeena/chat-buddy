import { describe, expect, it } from "vitest";

import type { ProviderTurn } from "@/domain/message.ts";

import { reply } from "../reply.ts";

const NOW = new Date("2026-11-09T15:30:00");

/**
 * Plays a conversation through the engine, one user message at a time, and
 * returns every reply. `random` is fixed so replies are deterministic; the
 * engine's no-repeat rule still varies them across a conversation.
 */
function chat(...messages: string[]): string[] {
  const turns: ProviderTurn[] = [];
  return messages.map((content) => {
    turns.push({ role: "user", content });
    const answer = reply(turns, { random: () => 0, now: NOW });
    turns.push({ role: "assistant", content: answer });
    return answer;
  });
}

/** The reply to the last message of a conversation. */
function last(...messages: string[]): string {
  return chat(...messages).at(-1) ?? "";
}

describe("memory and recall", () => {
  it("remembers a name from an introduction", () => {
    expect(last("my name is Kaushal", "what's my name?")).toContain("Kaushal");
  });

  it("takes a short answer to its own name question as the name", () => {
    const [greeting, answer] = chat("hi", "Asha");
    expect(greeting).toMatch(/what should i call you/i);
    expect(answer).toContain("Asha");
  });

  it("says so, and asks, when it does not know the name", () => {
    expect(last("what's my name?")).toMatch(/haven't told me/i);
  });

  it("does not mistake a state for a name", () => {
    expect(last("I'm tired", "what's my name?")).toMatch(/haven't told me/i);
  });

  it("collects likes from a list and recalls them", () => {
    expect(last("I like hiking, chess and jazz", "what do I like?")).toBe(
      "You like hiking, chess and jazz.",
    );
  });

  it("lets a later statement override an earlier one", () => {
    expect(last("I live in Pune", "I moved to Delhi", "where do I live?")).toContain(
      "Delhi",
    );
  });

  it("moves a thing from likes to dislikes when the person changes their mind", () => {
    const summary = last(
      "I love mornings",
      "I hate mornings",
      "what do you know about me?",
    );
    expect(summary).toContain("not a fan of mornings");
    expect(summary).not.toContain("you like mornings");
  });

  it("summarises everything it has learned", () => {
    const summary = last(
      "my name is Sam",
      "I'm 29",
      "I have a dog named Bruno",
      "my favourite colour is green",
      "what do you know about me?",
    );
    expect(summary).toContain("Sam");
    expect(summary).toContain("29");
    expect(summary).toContain("a dog called Bruno");
    expect(summary).toContain("favorite color is green");
  });

  it("recalls the first and the previous message", () => {
    expect(last("hello", "tell me a joke", "what was my first message?")).toContain(
      '"hello"',
    );
    expect(last("hello", "tell me a joke", "what did I just say?")).toContain(
      '"tell me a joke"',
    );
  });
});

describe("conversation flow", () => {
  it("never repeats a reply while unused options remain", () => {
    const replies = chat("tell me a joke", "yes", "yes", "yes");
    expect(new Set(replies).size).toBe(replies.length);
  });

  it("treats yes after an offer as accepting it, and no as declining", () => {
    const [joke, another, declined] = chat("tell me a joke", "yes", "no");
    expect(joke).toMatch(/want another one\?$/i);
    expect(another).toMatch(/want another one\?$/i);
    expect(declined).toMatch(/what else|what would you like/i);
  });

  it("plays a riddle: hint, wrong guess, then reveal", () => {
    const [riddle, hint, wrong, reveal] = chat(
      "give me a riddle",
      "hint",
      "a cat",
      "I give up",
    );
    expect(riddle).toMatch(/^Riddle time:/);
    expect(hint).toMatch(/^Hint: it starts with/);
    expect(wrong).toMatch(/^Not quite/);
    expect(reveal).toMatch(/^It's /);
  });

  it("lets a new request through while a riddle or game is open", () => {
    expect(last("give me a riddle", "tell me a joke")).toMatch(/want another one\?$/i);
    expect(last("I'm bored", "what is 6 times 7?")).toBe("6 * 7 = 42");
  });

  it("accepts a correct riddle answer", () => {
    // With random fixed at 0 the first riddle is asked: keys but no locks.
    expect(last("riddle", "a piano")).toMatch(/^(?:Yes!|Correct)/);
  });

  it("answers its own 'how are you' question back", () => {
    expect(last("how are you?", "good, you?")).toMatch(/^I'm doing well, thanks!/);
  });

  it("responds to a low mood with care, and offers to talk", () => {
    const [mood, follow] = chat("I'm feeling stressed", "yes");
    expect(mood).toMatch(/stressed|rough|sorry/i);
    expect(follow).toMatch(/listening/i);
  });

  it("answers 'and you?' on the topic just raised", () => {
    expect(last("my favourite colour is green", "and you?")).toMatch(/^Mine's teal/);
  });

  it("offers a game when the person is bored", () => {
    expect(last("I'm bored")).toMatch(/Would you rather/);
  });
});

describe("listening", () => {
  it("reflects feelings back as a question, swapping pronouns", () => {
    expect(last("I feel stuck in my job")).toBe("Why do you feel stuck in your job?");
  });

  it("keeps third-person verbs intact when reflecting", () => {
    expect(last("I think robots are cool")).toBe(
      "What makes you think robots are cool?",
    );
  });

  it("asks about people the person mentions", () => {
    expect(last("my sister is visiting")).toBe("Tell me more about your sister.");
  });

  it("is honest about questions beyond it", () => {
    expect(last("what is quantum physics?")).toMatch(/quantum physics/);
  });
});

describe("skills", () => {
  it("does arithmetic, including words and percentages", () => {
    expect(last("what's 12 times (3+4)?")).toBe("12 * (3+4) = 84");
    expect(last("what is 18% of 240")).toBe("18% of 240 is 43.2.");
  });

  it("tells the time and date from the clock it is given", () => {
    expect(last("what time is it?")).toBe("It's 3:30 PM on this device.");
    expect(last("what day is it?")).toBe("Today is Monday, November 9, 2026.");
  });

  it("rolls dice and flips coins", () => {
    expect(last("roll 2d6")).toBe("🎲 1 + 1 = 2.");
    expect(last("flip a coin")).toBe("Heads.");
  });
});
