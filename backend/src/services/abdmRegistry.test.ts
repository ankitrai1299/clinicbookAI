import { describe, it, expect } from 'vitest';

// The two decisions in ABDM registration that are easy to get quietly wrong:
// what counts as "registered", and what an empty box means.
import { cleanRegistryId, isRegistrationComplete } from './abdmRegistry.service';

describe('isRegistrationComplete', () => {
  it('is true when the clinic and every doctor is registered', () => {
    expect(isRegistrationComplete('HFR-1', [{ hprId: 'HPR-1' }, { hprId: 'HPR-2' }])).toBe(true);
  });

  it('is FALSE for a clinic with no doctors', () => {
    // every() on an empty list is true. Without the length check a clinic that
    // had only entered its HFR id would be told it was ready for ABDM, and the
    // first share would fail with no doctor to attribute it to.
    expect(isRegistrationComplete('HFR-1', [])).toBe(false);
  });

  it('is false while any one doctor is still unregistered', () => {
    expect(isRegistrationComplete('HFR-1', [{ hprId: 'HPR-1' }, { hprId: null }])).toBe(false);
  });

  it('is false without the clinic, however many doctors are registered', () => {
    expect(isRegistrationComplete(null, [{ hprId: 'HPR-1' }])).toBe(false);
  });
});

describe('cleanRegistryId', () => {
  it('treats a blank box as CLEARED, not as "leave it alone"', () => {
    // The opposite of every other field in the product, and deliberate: an id
    // has no format to validate, so a typo is stored in silence. If blank meant
    // "unchanged", a wrong id could never be taken back out.
    expect(cleanRegistryId('')).toBeNull();
    expect(cleanRegistryId('   ')).toBeNull();
    expect(cleanRegistryId(undefined)).toBeNull();
  });

  it('trims what was pasted', () => {
    expect(cleanRegistryId('  IN0123456789  ')).toBe('IN0123456789');
  });

  it('refuses something far too long to be an id', () => {
    // Not validation of the format — there is none to check. This only catches
    // a whole page pasted into the box by accident.
    expect(() => cleanRegistryId('X'.repeat(61))).toThrow();
  });
});
