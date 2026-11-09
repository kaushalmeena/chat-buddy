import type { RandomSource } from "./text.ts";

/**
 * Things the built-in engine can actually work out, rather than look up: sums,
 * the time and date, dice and coins. Each returns `undefined` when the message is
 * not for it, so the caller can fall through to conversation.
 */

/** Spelled-out operators people type, mapped onto symbols the parser reads. */
const OPERATOR_WORDS: readonly (readonly [RegExp, string])[] = [
  [/\b(?:plus|add|and)\b/g, "+"],
  [/\b(?:minus|subtract|less)\b/g, "-"],
  [/\b(?:times|multiplied by|x)\b/g, "*"],
  [/\b(?:divided by|over)\b/g, "/"],
  [/\b(?:mod|modulo)\b/g, "%"],
  [/\b(?:to the power of|power)\b/g, "^"],
  [/\bsquared\b/g, "^2"],
  [/\bcubed\b/g, "^3"],
  [/×/g, "*"],
  [/÷/g, "/"],
];

/**
 * A small recursive-descent parser for + - * / % ^ and parentheses.
 *
 * Deliberately not `eval` or `Function`: the input is whatever someone typed, and
 * the only things it can ever do here are arithmetic. Returns `undefined` for
 * anything that is not a complete, finite expression.
 */
export function evaluate(expression: string): number | undefined {
  const tokens = expression.match(/\d+(?:\.\d+)?|[-+*/%^()]/g);
  if (!tokens || tokens.join("") !== expression.replace(/\s+/g, "")) return undefined;

  let position = 0;
  const peek = () => tokens[position];
  const next = () => tokens[position++];

  const primary = (): number | undefined => {
    const token = next();
    if (token === "(") {
      const value = sum();
      return next() === ")" ? value : undefined;
    }
    if (token === "-") {
      const value = power();
      return value === undefined ? undefined : -value;
    }
    if (token === "+") return power();
    return token !== undefined && /^\d/.test(token) ? Number(token) : undefined;
  };

  const power = (): number | undefined => {
    const base = primary();
    if (base === undefined) return undefined;
    if (peek() !== "^") return base;
    next();
    const exponent = power();
    return exponent === undefined ? undefined : base ** exponent;
  };

  const product = (): number | undefined => {
    let value = power();
    while (
      value !== undefined &&
      (peek() === "*" || peek() === "/" || peek() === "%")
    ) {
      const operator = next();
      const right = power();
      if (right === undefined) return undefined;
      if (operator === "*") value *= right;
      else if (operator === "/") value /= right;
      else value %= right;
    }
    return value;
  };

  const sum = (): number | undefined => {
    let value = product();
    while (value !== undefined && (peek() === "+" || peek() === "-")) {
      const operator = next();
      const right = product();
      if (right === undefined) return undefined;
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  };

  const result = sum();
  return position === tokens.length && result !== undefined && Number.isFinite(result)
    ? result
    : undefined;
}

function formatNumber(value: number): string {
  const rounded = Math.round(value * 1e6) / 1e6;
  return rounded.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

/** "What is 12 times 7?", "(3+4)^2", "calculate 18% of 250". */
export function arithmetic(text: string): string | undefined {
  const percent = text.match(/(\d+(?:\.\d+)?)\s*(?:%|percent) of (\d+(?:\.\d+)?)/);
  if (percent?.[1] && percent[2]) {
    const value = (Number(percent[1]) / 100) * Number(percent[2]);
    return `${percent[1]}% of ${percent[2]} is ${formatNumber(value)}.`;
  }

  const root = text.match(/\bsquare root of (\d+(?:\.\d+)?)/);
  if (root?.[1])
    return `The square root of ${root[1]} is ${formatNumber(Math.sqrt(Number(root[1])))}.`;

  let candidate = text
    .replace(/^(?:what is|what's|calculate|compute|solve|how much is|evaluate)\s+/, "")
    .replace(/[?=!]+$/g, "")
    .trim();
  for (const [pattern, symbol] of OPERATOR_WORDS)
    candidate = candidate.replace(pattern, symbol);

  // Must contain an operator between numbers; a bare "7" is not a sum.
  if (!/\d\s*[-+*/%^]\s*[-(]?\s*\d|\)\s*[-+*/%^]/.test(candidate)) return undefined;

  const value = evaluate(candidate);
  if (value === undefined) {
    return /\/\s*0(?!\.)/.test(candidate)
      ? "Dividing by zero breaks maths — and me."
      : undefined;
  }
  return `${candidate.replace(/\s+/g, " ")} = ${formatNumber(value)}`;
}

/** The time and date, from the device clock. */
export function clock(text: string, now: Date): string | undefined {
  if (
    /\bwhat (?:time is it|is the time)\b|\btime (?:is it|now)\b|\bcurrent time\b/.test(
      text,
    )
  ) {
    const time = now.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    return `It's ${time} on this device.`;
  }
  if (
    /\bwhat (?:day|date) is it\b|\b(?:today'?s|the) date\b|\bwhat is today\b|\bwhich day\b/.test(
      text,
    )
  ) {
    const date = now.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    return `Today is ${date}.`;
  }
  if (/\bwhat year is it\b/.test(text)) return `It's ${now.getFullYear()}.`;
  return undefined;
}

/** Dice, coins and random numbers. */
export function chance(text: string, random: RandomSource): string | undefined {
  if (/\b(?:flip|toss) (?:a )?coin\b|\bheads or tails\b/.test(text)) {
    return random() < 0.5 ? "Heads." : "Tails.";
  }

  const dice = text.match(/\broll (?:a |an )?(?:(\d+)\s*)?(?:d(\d+)|dice|die)\b/);
  if (dice) {
    const count = Math.min(Number(dice[1] ?? 1), 10);
    const sides = Math.min(Number(dice[2] ?? 6), 1000);
    const rolls = Array.from({ length: count }, () => 1 + Math.floor(random() * sides));
    const total = rolls.reduce((a, b) => a + b, 0);
    return count === 1
      ? `🎲 You rolled a ${rolls[0]}.`
      : `🎲 ${rolls.join(" + ")} = ${total}.`;
  }

  const range = text.match(
    /\b(?:random|pick a) number (?:between|from) (\d+) (?:and|to) (\d+)/,
  );
  if (range?.[1] && range[2]) {
    const [low, high] = [Number(range[1]), Number(range[2])].toSorted((a, b) => a - b);
    if (low === undefined || high === undefined) return undefined;
    return `${low + Math.floor(random() * (high - low + 1))}.`;
  }
  return undefined;
}
