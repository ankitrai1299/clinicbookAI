import { describe, it, expect } from 'vitest';

import {
  CHILD_AGE_LIMIT,
  childConsentEvidence,
  guardianRelation,
  guardianRequiredFor,
  isChild
} from './childConsent';

describe('isChild', () => {
  it('uses India’s definition, which is under eighteen', () => {
    // Not 13, and not 16. Getting this wrong the usual way — copying a US or EU
    // threshold — would leave 16- and 17-year-olds unprotected.
    expect(CHILD_AGE_LIMIT).toBe(18);
    expect(isChild(17)).toBe(true);
    expect(isChild(18)).toBe(false);
    expect(isChild(0)).toBe(true);
  });

  it('treats an unrecorded age as an adult', () => {
    // Deliberate, and the residual gap in §9. Demanding guardian details for
    // every patient whose age nobody typed would stop a clinic working, and
    // clinics would route around it the same day.
    expect(isChild(null)).toBe(false);
    expect(isChild(undefined)).toBe(false);
    expect(isChild(Number.NaN)).toBe(false);
    expect(isChild(-1)).toBe(false);
  });
});

describe('guardianRelation', () => {
  it('accepts only the relationships offered', () => {
    expect(guardianRelation('Mother')).toBe('mother');
    expect(guardianRelation(' father ')).toBe('father');
    expect(guardianRelation('guardian')).toBe('guardian');
  });

  it('refuses anything else rather than storing it', () => {
    // This ends up in a consent record that may be produced years later. Free
    // text there is a liability, not a convenience.
    expect(guardianRelation('uncle')).toBeNull();
    expect(guardianRelation('')).toBeNull();
    expect(guardianRelation(null)).toBeNull();
    expect(guardianRelation(42)).toBeNull();
  });
});

describe('guardianRequiredFor', () => {
  it('asks nothing of an adult', () => {
    expect(guardianRequiredFor(30, {})).toBeNull();
    expect(guardianRequiredFor(null, {})).toBeNull();
  });

  it('returns the guardian to store for a child', () => {
    expect(guardianRequiredFor(9, { guardianName: ' Asha Verma ', guardianRelation: 'Mother' })).toEqual({
      name: 'Asha Verma',
      relation: 'mother'
    });
  });

  it('refuses a child registration with no guardian, and says why', () => {
    const cases = [
      {},
      { guardianName: 'Asha Verma' },
      { guardianRelation: 'mother' },
      { guardianName: '   ', guardianRelation: 'mother' },
      { guardianName: 'Asha Verma', guardianRelation: 'uncle' }
    ];
    for (const input of cases) {
      expect(() => guardianRequiredFor(9, input), JSON.stringify(input)).toThrow(/parent or guardian/i);
    }
  });
});

describe('childConsentEvidence', () => {
  it('reads to someone who was not there', () => {
    // The only time anybody reads a consent record is long afterwards, usually
    // because something has gone wrong. It has to stand on its own.
    expect(childConsentEvidence({ name: 'Asha Verma', relation: 'mother' }, 'Rahul Verma')).toBe(
      'Given by Asha Verma (mother) on behalf of Rahul Verma, a patient under 18.'
    );
  });
});
