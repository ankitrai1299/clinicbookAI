import { describe, it, expect, beforeEach } from 'vitest';

import { capabilityRegistry } from './capabilityRegistry.js';
import type { Capability } from './mcp.types.js';

const cap = (over: Partial<Capability> = {}): Capability => ({
  name: 'test.cap',
  product: 'core',
  description: 'a test capability',
  handler: () => 'ok',
  ...over
});

describe('capabilityRegistry', () => {
  beforeEach(() => capabilityRegistry.clear());

  it('registers and retrieves a capability by name', () => {
    const c = cap();
    capabilityRegistry.register(c);
    expect(capabilityRegistry.has('test.cap')).toBe(true);
    expect(capabilityRegistry.get('test.cap')).toBe(c);
    expect(capabilityRegistry.list()).toHaveLength(1);
  });

  it('indexes intents so resolveIntent maps intent → capability name', () => {
    capabilityRegistry.register(cap({ name: 'appointment.book', intents: ['book'] }));
    expect(capabilityRegistry.resolveIntent('book')).toBe('appointment.book');
    expect(capabilityRegistry.resolveIntent('nope')).toBeUndefined();
  });

  it('throws on a duplicate capability name', () => {
    capabilityRegistry.register(cap());
    expect(() => capabilityRegistry.register(cap())).toThrow(/already registered/);
  });

  it('throws when two capabilities claim the same intent', () => {
    capabilityRegistry.register(cap({ name: 'a', intents: ['book'] }));
    expect(() => capabilityRegistry.register(cap({ name: 'b', intents: ['book'] }))).toThrow(
      /already routed/
    );
  });

  it('clear() removes capabilities and their intent index', () => {
    capabilityRegistry.register(cap({ name: 'a', intents: ['book'] }));
    capabilityRegistry.clear();
    expect(capabilityRegistry.has('a')).toBe(false);
    expect(capabilityRegistry.resolveIntent('book')).toBeUndefined();
    expect(capabilityRegistry.list()).toHaveLength(0);
  });
});
