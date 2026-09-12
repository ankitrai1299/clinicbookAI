import { describe, it, expect } from 'vitest';

import { needsMeaning, isMeaningLanguage } from './liveMeaning';

// The second line under the live transcript.
//
// The rule tested here is the one that decides whether it appears at all. Get it
// wrong in one direction and a doctor who does not speak Bhojpuri is left with a
// line they cannot read; wrong in the other and every Hindi sentence is followed
// by the same Hindi sentence, which makes the screen look busy and says nothing.

describe('needsMeaning', () => {
  it('shows nothing when the doctor has it switched off', () => {
    for (const lang of ['bn-IN', 'hi-IN', undefined]) {
      expect(needsMeaning(lang, 'off'), String(lang)).toBe(false);
    }
  });

  it('shows a meaning when the line is in another language', () => {
    expect(needsMeaning('bn-IN', 'hi')).toBe(true);
    expect(needsMeaning('hi-IN', 'en')).toBe(true);
    expect(needsMeaning('ta-IN', 'en')).toBe(true);
  });

  it('shows nothing when the line is already in the language asked for', () => {
    // A row that repeats the row above it is noise pretending to be a feature.
    expect(needsMeaning('hi-IN', 'hi')).toBe(false);
    expect(needsMeaning('en-IN', 'en')).toBe(false);
  });

  it('ignores the region, which is not what was asked about', () => {
    // en-IN, en-US and plain en are one language for this decision.
    expect(needsMeaning('en-US', 'en')).toBe(false);
    expect(needsMeaning('en', 'en')).toBe(false);
    expect(needsMeaning('hi', 'hi')).toBe(false);
  });

  it('shows a meaning when the provider did not say what it heard', () => {
    // Assuming an unknown language is the target would silently drop the second
    // line for exactly the patients who need it — the ones whose language the
    // provider could not name, which skews toward the less common ones.
    for (const unknown of [undefined, '', '   ']) {
      expect(needsMeaning(unknown, 'en'), JSON.stringify(unknown)).toBe(true);
    }
  });
});

describe('isMeaningLanguage', () => {
  it('accepts only the three real choices', () => {
    for (const v of ['off', 'hi', 'en']) expect(isMeaningLanguage(v), v).toBe(true);
  });

  it('rejects anything else a client might send', () => {
    // This guards a value that comes off a socket, so it is checked rather than
    // trusted — a stray string here would reach a prompt.
    for (const v of ['HI', 'english', 'bn', '', null, undefined, 42, {}]) {
      expect(isMeaningLanguage(v), JSON.stringify(v)).toBe(false);
    }
  });
});
