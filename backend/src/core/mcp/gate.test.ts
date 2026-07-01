import { describe, it, expect, afterEach } from 'vitest';

import { env } from '../../config/env.js';
import { isBrainEnabledFor } from './gate.js';

// The gate caches by raw value, so simply reassigning env.MCP_BRAIN_NUMBERS
// between cases re-parses. Restore to the default (OFF) after each test.
const set = (v: string) => {
  (env as { MCP_BRAIN_NUMBERS: string }).MCP_BRAIN_NUMBERS = v;
};

describe('isBrainEnabledFor (MCP_BRAIN rollout gate)', () => {
  afterEach(() => set(''));

  it('is OFF for everyone by default (blank)', () => {
    set('');
    expect(isBrainEnabledFor('919812345678')).toBe(false);
  });

  it('is OFF when explicitly disabled', () => {
    set('off');
    expect(isBrainEnabledFor('919812345678')).toBe(false);
  });

  it('is ON for everyone with "*" / "all"', () => {
    set('all');
    expect(isBrainEnabledFor('919812345678')).toBe(true);
    set('*');
    expect(isBrainEnabledFor('7903884686')).toBe(true);
  });

  it('enables only listed numbers, matched on the last 10 digits', () => {
    set('919812345678, 919900000000');
    expect(isBrainEnabledFor('9812345678')).toBe(true); // same national number, no country code
    expect(isBrainEnabledFor('+91 99000 00000')).toBe(true); // formatted
    expect(isBrainEnabledFor('919711111111')).toBe(false); // not listed
  });
});
