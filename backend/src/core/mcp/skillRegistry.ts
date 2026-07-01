// Registry of multi-turn skills (see skill.types.ts). Products register their
// skills at startup, exactly like capabilities and event subscriptions — the
// brain (core) never imports products.
//
// Routing rules the brain relies on:
//  - A classified intent maps to the skill that DECLARES it (intent index).
//  - Exactly one skill may be the FALLBACK — the catch-all for anything no skill
//    claims. Slice-1 booking is the fallback.
//  - `hasRoutableIntents()` lets the brain SKIP classification entirely when only
//    the fallback exists, so slice 1 spends zero extra AI calls and behaves
//    byte-for-byte like the current FSM path.

import type { Skill } from './skill.types.js';

class SkillRegistry {
  private skills = new Map<string, Skill>();
  private intentIndex = new Map<string, string>();
  private fallback: string | null = null;

  register(skill: Skill): void {
    if (this.skills.has(skill.name)) {
      throw new Error(`[mcp] skill "${skill.name}" is already registered`);
    }
    this.skills.set(skill.name, skill);

    for (const intent of skill.intents ?? []) {
      const existing = this.intentIndex.get(intent);
      if (existing && existing !== skill.name) {
        throw new Error(
          `[mcp] intent "${intent}" is already routed to skill "${existing}", cannot also route to "${skill.name}"`
        );
      }
      this.intentIndex.set(intent, skill.name);
    }

    if (skill.isFallback) {
      if (this.fallback && this.fallback !== skill.name) {
        throw new Error(
          `[mcp] fallback skill is already "${this.fallback}", cannot also set "${skill.name}"`
        );
      }
      this.fallback = skill.name;
    }
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  has(name: string): boolean {
    return this.skills.has(name);
  }

  /** True if any non-fallback skill has claimed an intent (→ classify is worth it). */
  hasRoutableIntents(): boolean {
    return this.intentIndex.size > 0;
  }

  /** The skill for a classified intent, falling back to the catch-all skill. */
  resolve(intent: string): Skill | undefined {
    const byIntent = this.intentIndex.get(intent);
    if (byIntent) return this.skills.get(byIntent);
    return this.fallback ? this.skills.get(this.fallback) : undefined;
  }

  fallbackSkill(): Skill | undefined {
    return this.fallback ? this.skills.get(this.fallback) : undefined;
  }

  list(): Skill[] {
    return [...this.skills.values()];
  }

  clear(): void {
    this.skills.clear();
    this.intentIndex.clear();
    this.fallback = null;
  }
}

export const skillRegistry = new SkillRegistry();
