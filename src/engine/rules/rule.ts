/**
 * The rule format that replaced the old `brain.xml`.
 *
 * Moving the knowledge base into TypeScript buys three things the XML could not
 * offer: the shape is checked at build time, the patterns compile once at module
 * load instead of on every message, and the whole table is tree-shaken into the
 * bundle with no runtime fetch or DOMParser pass.
 */

export type Rule = {
  /** Stable identifier, used by tests and analytics. Never shown to a person. */
  readonly id: string;
  /**
   * Patterns tried in order. Written source-form and compiled by
   * `compileRules`, which anchors nothing — these are substring matches.
   */
  readonly patterns: readonly string[];
  /** One is chosen at random per match, so repeated questions vary. */
  readonly replies: readonly string[];
  /**
   * Optional skill to invoke when this rule matches. The rule's reply is the
   * lead-in text; the skill supplies structured output alongside it.
   */
  readonly skillId?: string;
};

export type CompiledRule = Omit<Rule, "patterns"> & {
  readonly matchers: readonly RegExp[];
};

/**
 * Compiles a rule table once. Exported separately from `rules.ts` so tests can
 * compile fixtures without pulling in the real knowledge base.
 */
export function compileRules(rules: readonly Rule[]): CompiledRule[] {
  return rules.map(({ patterns, ...rest }) => ({
    ...rest,
    matchers: patterns.map((pattern) => new RegExp(pattern, "iu")),
  }));
}
