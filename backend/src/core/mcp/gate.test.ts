import { describe, it, expect, afterEach } from 'vitest';

import { env } from '../../config/env.js';
import { isBrainEnabledFor } from './gate.js';

// The gate caches by raw value, so simply reassigning env.MCP_BRAIN_NUMBERS
// between cases re-parses. Restore to blank after each test.
//
// The default changed on 18 Aug 2026 from OFF to ON. The case that forced it is
// pinned below: a real patient asked for their report and got a booking menu,
// because the variable held ONE number — someone else's — and an opt-in list
// nobody remembers is indistinguishable from a broken feature.
const set = (v: string) => {
  (env as { MCP_BRAIN_NUMBERS: string }).MCP_BRAIN_NUMBERS = v;
};

describe('isBrainEnabledFor (MCP_BRAIN rollout gate)', () => {
  afterEach(() => set(''));

  it('is ON for everyone by default (blank)', () => {
    set('');
    expect(isBrainEnabledFor('919812345678')).toBe(true);
    expect(isBrainEnabledFor('9650803093')).toBe(true);
  });

  it('is OFF when explicitly disabled', () => {
    set('off');
    expect(isBrainEnabledFor('919812345678')).toBe(false);
  });

  it('is ON for everyone with "*" / "all" / "on", whatever the case', () => {
    for (const value of ['all', '*', 'on', 'ALL']) {
      set(value);
      expect(isBrainEnabledFor('919812345678'), value).toBe(true);
    }
  });

  it('a single listed number does NOT enable anyone else', () => {
    // Exactly the production state that caused the bug: the variable held one
    // number, so every other patient fell through to the FSM and got a booking
    // menu when they asked for their report.
    set('7903884686');
    expect(isBrainEnabledFor('7903884686')).toBe(true);
    expect(isBrainEnabledFor('9650803093')).toBe(false);
  });

  it('enables only listed numbers, matched on the last 10 digits', () => {
    set('919812345678, 919900000000');
    expect(isBrainEnabledFor('9812345678')).toBe(true); // same national number, no country code
    expect(isBrainEnabledFor('+91 99000 00000')).toBe(true); // formatted
    expect(isBrainEnabledFor('919711111111')).toBe(false); // not listed
  });
});
