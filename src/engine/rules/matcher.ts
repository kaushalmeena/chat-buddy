import type { CompiledRule } from "./rule.ts";

export type RuleMatch = {
  readonly ruleId: string;
  readonly reply: string;
  readonly skillId?: string;
};

/**
 * Picks an element uniformly at random. Injectable so tests can make selection
 * deterministic without stubbing globals.
 */
export type RandomSource = () => number;

function choose<T>(items: readonly T[], random: RandomSource): T | undefined {
  if (items.length === 0) return undefined;
  const index = Math.min(items.length - 1, Math.floor(random() * items.length));
  return items[index];
}

/**
 * Returns the first rule whose pattern matches, along with one of its replies.
 *
 * The original implementation walked the XML DOM and ran `new RegExp(...)` per
 * category on every single message; here the table arrives pre-compiled, so a
 * match is a plain loop over cached `RegExp` objects.
 */
export function matchRule(
  message: string,
  rules: readonly CompiledRule[],
  random: RandomSource = Math.random,
): RuleMatch | undefined {
  const text = message.trim();
  if (text.length === 0) return undefined;

  for (const rule of rules) {
    const matched = rule.matchers.some((matcher) => matcher.test(text));
    if (!matched) continue;

    const reply = choose(rule.replies, random);
    if (reply === undefined) continue;

    return rule.skillId === undefined
      ? { ruleId: rule.id, reply }
      : { ruleId: rule.id, reply, skillId: rule.skillId };
  }

  return undefined;
}
