import { describe, it, expect } from 'vitest';

// How an ABHA is normalised before it is stored. Both of these decide whether
// ABDM will ever be able to match this patient, and both fail silently if wrong
// — the record looks fine on screen and discovery simply never finds them.
import { normaliseAbhaNumber, normaliseAbhaAddress } from './abdmIdentity.service';

describe('normaliseAbhaNumber', () => {
  it('stores the number the way it is printed on the card', () => {
    // A desk checking a stored value against the patient's card should be
    // comparing like with like, not counting digits.
    expect(normaliseAbhaNumber('12345678901234')).toBe('12-3456-7890-1234');
  });

  it('accepts it however the desk types it', () => {
    for (const typed of ['12-3456-7890-1234', '12 3456 7890 1234', '1234 5678 901234']) {
      expect(normaliseAbhaNumber(typed)).toBe('12-3456-7890-1234');
    }
  });

  it('refuses a number that is not 14 digits', () => {
    // The commonest desk error is a dropped or doubled digit. Storing it would
    // produce a patient ABDM can never match, with nothing on screen wrong.
    expect(() => normaliseAbhaNumber('1234567890123')).toThrow();
    expect(() => normaliseAbhaNumber('123456789012345')).toThrow();
  });

  it('treats blank as CLEARED rather than as an error', () => {
    // An identity typed onto the wrong patient has to be removable, and no
    // format check can catch "right format, wrong person".
    expect(normaliseAbhaNumber('')).toBeNull();
    expect(normaliseAbhaNumber('   ')).toBeNull();
    expect(normaliseAbhaNumber(undefined)).toBeNull();
  });
});

describe('normaliseAbhaAddress', () => {
  it('lower-cases what was typed', () => {
    // ABDM sends the address back in discovery and compares it as-is. A desk
    // that typed "Asha@sbx" would create a patient who can never be matched —
    // and nothing would look wrong.
    expect(normaliseAbhaAddress('Asha@SBX')).toBe('asha@sbx');
  });

  it('accepts the shapes a real address takes', () => {
    expect(normaliseAbhaAddress('asha.verma@abdm')).toBe('asha.verma@abdm');
    expect(normaliseAbhaAddress('asha_v1@sbx')).toBe('asha_v1@sbx');
    expect(normaliseAbhaAddress('  ravi@abdm  ')).toBe('ravi@abdm');
  });

  it('refuses something that is not an address', () => {
    expect(() => normaliseAbhaAddress('asha')).toThrow();
    expect(() => normaliseAbhaAddress('@sbx')).toThrow();
    expect(() => normaliseAbhaAddress('asha@')).toThrow();
    expect(() => normaliseAbhaAddress('asha @sbx')).toThrow();
  });

  it('treats blank as CLEARED', () => {
    expect(normaliseAbhaAddress('')).toBeNull();
    expect(normaliseAbhaAddress(undefined)).toBeNull();
  });
});
