import { describe, expect, it } from "vitest";
import { matchRule } from "./matcher.ts";
import { compileRules, type Rule } from "./rule.ts";
import { COMPILED_RULES } from "./rules.ts";

/** Deterministic stand-in for `Math.random`, always selecting the first reply. */
const alwaysFirst = () => 0;

describe("matchRule", () => {
  const fixtures: readonly Rule[] = [
    { id: "greeting", patterns: ["\\bhello\\b"], replies: ["one", "two"] },
    { id: "skilled", patterns: ["\\bcat\\b"], replies: ["meow"], skillId: "media.cat" },
    { id: "fallback", patterns: [".*"], replies: ["huh"] },
  ];
  const compiled = compileRules(fixtures);

  it("returns the first matching rule", () => {
    expect(matchRule("hello there", compiled, alwaysFirst)).toEqual({
      ruleId: "greeting",
      reply: "one",
    });
  });

  it("is case insensitive", () => {
    expect(matchRule("HELLO", compiled, alwaysFirst)?.ruleId).toBe("greeting");
  });

  it("carries the skill id when a rule declares one", () => {
    expect(matchRule("a cat appeared", compiled, alwaysFirst)).toEqual({
      ruleId: "skilled",
      reply: "meow",
      skillId: "media.cat",
    });
  });

  it("omits skillId entirely for rules without one", () => {
    const match = matchRule("hello", compiled, alwaysFirst);
    expect(match && "skillId" in match).toBe(false);
  });

  it("falls through to the catch-all rule", () => {
    expect(matchRule("wholly unrelated", compiled, alwaysFirst)?.ruleId).toBe(
      "fallback",
    );
  });

  it("returns undefined for blank input rather than matching the catch-all", () => {
    expect(matchRule("   ", compiled, alwaysFirst)).toBeUndefined();
    expect(matchRule("", compiled, alwaysFirst)).toBeUndefined();
  });

  it("selects a reply using the injected random source", () => {
    // 0.99 must land on the last reply, not out of bounds.
    expect(matchRule("hello", compiled, () => 0.99)?.reply).toBe("two");
  });

  it("never indexes out of bounds when random returns exactly 1", () => {
    expect(matchRule("hello", compiled, () => 1)?.reply).toBe("two");
  });
});

describe("the built-in rule table", () => {
  it("answers every message, because the catch-all is last", () => {
    const inputs = ["hello", "how are you", "qwertyuiop", "¿qué tal?", "123"];

    for (const input of inputs) {
      expect(matchRule(input, COMPILED_RULES, alwaysFirst)).toBeDefined();
    }
  });

  it("matches greetings ahead of the catch-all", () => {
    expect(matchRule("hey", COMPILED_RULES, alwaysFirst)?.ruleId).toBe("greeting");
  });

  it("does not match a greeting inside an unrelated word", () => {
    // A bare-substring matcher would match "hi" inside "this".
    expect(matchRule("this thing", COMPILED_RULES, alwaysFirst)?.ruleId).toBe(
      "fallback",
    );
  });

  it("recognises the wellbeing question", () => {
    expect(matchRule("how are you?", COMPILED_RULES, alwaysFirst)?.ruleId).toBe(
      "wellbeing",
    );
  });
});
