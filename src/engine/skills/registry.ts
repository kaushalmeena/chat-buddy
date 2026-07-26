import type { Attachment } from "@/domain/message.ts";

/**
 * A skill is a named capability the assistant can invoke to produce structured
 * output — a cat picture, a weather card, a calculation.
 *
 * This replaces the original numeric action codes (`101`–`108`), where the
 * meaning of a reply lived in a `switch` statement and every branch wrote remote
 * strings straight into `innerHTML`. Skills return typed `Attachment` values
 * instead, so the UI decides how to render and no skill can inject markup.
 *
 * The registry intentionally ships with **no skills registered**. It is the seam
 * that later capabilities plug into.
 */

export type SkillContext = {
  /** The message that triggered the skill. */
  readonly input: string;
  /** Aborts when the person stops generation or switches threads. */
  readonly signal: AbortSignal;
};

export type Skill = {
  /** Dotted, stable, human-readable — `"media.cat"`, not `104`. */
  readonly id: string;
  readonly label: string;
  /** Shown in help and used as the tool description for model tool-calling. */
  readonly description: string;
  run(context: SkillContext): Promise<Attachment>;
};

export class SkillRegistry {
  #skills = new Map<string, Skill>();

  register(skill: Skill): void {
    if (this.#skills.has(skill.id)) {
      throw new Error(`Skill "${skill.id}" is already registered.`);
    }
    this.#skills.set(skill.id, skill);
  }

  get(id: string): Skill | undefined {
    return this.#skills.get(id);
  }

  has(id: string): boolean {
    return this.#skills.has(id);
  }

  list(): readonly Skill[] {
    return [...this.#skills.values()];
  }

  get size(): number {
    return this.#skills.size;
  }

  /**
   * Runs a skill, returning `undefined` when it is not registered so a stale
   * rule reference degrades to a plain text reply rather than an error.
   */
  async run(id: string, context: SkillContext): Promise<Attachment | undefined> {
    const skill = this.#skills.get(id);
    if (!skill) return undefined;
    return skill.run(context);
  }
}

/**
 * The application-wide registry.
 *
 * To add a capability: implement `Skill`, add its `Attachment` variant in
 * `domain/message.ts`, render that variant in the attachment renderer, and
 * register it here.
 */
export const skills = new SkillRegistry();
