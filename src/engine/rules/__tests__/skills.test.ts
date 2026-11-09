import { describe, expect, it } from "vitest";

import { evaluate } from "../skills.ts";

describe("evaluate", () => {
  it.each([
    ["1+2*3", 7],
    ["(1+2)*3", 9],
    ["2^3^2", 512],
    ["-3+5", 2],
    ["10/4", 2.5],
    ["7%3", 1],
    ["2*(3+(4-1))", 12],
  ])("%s = %d", (expression, expected) => {
    expect(evaluate(expression)).toBe(expected);
  });

  it.each(["1+", "(1+2", "2**3", "alert(1)", "1/0", "", "1 2"])(
    "rejects %j",
    (expression) => {
      expect(evaluate(expression)).toBeUndefined();
    },
  );
});
