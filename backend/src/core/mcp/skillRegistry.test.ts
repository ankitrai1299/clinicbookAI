import { describe, it, expect, beforeEach } from 'vitest';

import { skillRegistry } from './skillRegistry.js';
import type { Skill } from './skill.types.js';

const skill = (over: Partial<Skill> = {}): Skill => ({
  name: 's',
  product: 'core',
  handle: async () => ({ reply: 'ok', done: true }),
  ...over
});

describe('skillRegistry', () => {
  beforeEach(() => skillRegistry.clear());

  it('registers and resolves a skill by intent', () => {
    const s = skill({ name: 'reminder', intents: ['reminder'] });
    skillRegistry.register(s);
    expect(skillRegistry.resolve('reminder')).toBe(s);
    expect(skillRegistry.hasRoutableIntents()).toBe(true);
  });

  it('falls back to the catch-all skill for an unclaimed intent', () => {
    const fb = skill({ name: 'booking', isFallback: true });
    skillRegistry.register(fb);
    expect(skillRegistry.resolve('anything')).toBe(fb);
    // Only a fallback (no intents) → classification can be skipped.
    expect(skillRegistry.hasRoutableIntents()).toBe(false);
  });

  it('prefers the intent-claiming skill over the fallback', () => {
    const fb = skill({ name: 'booking', isFallback: true });
    const rem = skill({ name: 'reminder', intents: ['reminder'] });
    skillRegistry.register(fb);
    skillRegistry.register(rem);
    expect(skillRegistry.resolve('reminder')).toBe(rem);
    expect(skillRegistry.resolve('book')).toBe(fb);
  });

  it('throws on duplicate skill name, duplicate intent, or two fallbacks', () => {
    skillRegistry.register(skill({ name: 'a', intents: ['x'], isFallback: true }));
    expect(() => skillRegistry.register(skill({ name: 'a' }))).toThrow(/already registered/);
    expect(() => skillRegistry.register(skill({ name: 'b', intents: ['x'] }))).toThrow(/already routed/);
    expect(() => skillRegistry.register(skill({ name: 'c', isFallback: true }))).toThrow(/fallback/);
  });
});
