import { describe, it, expect } from 'vitest';

// The two conversions ABDM's linking flow needs from our data, and the token
// freshness rule that keeps a clinic from being locked out.
import { abdmGender, yearOfBirthFromAge } from './abdmLink.service';
import { linkTokenIsFresh } from '../../services/abdmCareLink.service';

describe('abdmGender', () => {
  it('reads the forms a desk actually types', () => {
    for (const male of ['M', 'm', 'Male', 'male', 'MALE ']) {
      expect(abdmGender(male), male).toBe('M');
    }
    for (const female of ['F', 'f', 'Female', 'female']) {
      expect(abdmGender(female), female).toBe('F');
    }
  });

  it('falls back to O rather than refusing', () => {
    // A link must not fail because someone wrote something unexpected in a free
    // text box. Gender is not what identifies the patient here — the ABHA
    // address is — so an odd value costs accuracy, not the whole operation.
    expect(abdmGender('Other')).toBe('O');
    expect(abdmGender('')).toBe('O');
    expect(abdmGender(null)).toBe('O');
    expect(abdmGender(undefined)).toBe('O');
  });
});

describe('yearOfBirthFromAge', () => {
  const now = new Date('2026-09-07T00:00:00Z');

  it('derives the year from the age we store', () => {
    expect(yearOfBirthFromAge(36, now)).toBe('1990');
    expect(yearOfBirthFromAge(0, now)).toBe('2026');
  });

  it('returns null when there is no usable age', () => {
    // ABDM rejects a bad year with a message about its range, which tells the
    // desk nothing. Refusing here lets the caller say what is actually wrong:
    // this patient's age was never recorded.
    expect(yearOfBirthFromAge(null, now)).toBeNull();
    expect(yearOfBirthFromAge(undefined, now)).toBeNull();
    expect(yearOfBirthFromAge(-1, now)).toBeNull();
    expect(yearOfBirthFromAge(200, now)).toBeNull();
    expect(yearOfBirthFromAge(Number.NaN, now)).toBeNull();
  });

  it('ignores a fractional age rather than sending a fractional year', () => {
    expect(yearOfBirthFromAge(36.7, now)).toBe('1990');
  });
});

describe('linkTokenIsFresh', () => {
  const now = new Date('2026-09-07T00:00:00Z');
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60_000);

  it('reuses a token issued recently', () => {
    expect(linkTokenIsFresh(daysAgo(1), now)).toBe(true);
    expect(linkTokenIsFresh(daysAgo(100), now)).toBe(true);
  });

  it('retires a token a fortnight BEFORE its six months are up', () => {
    // A token that expires between the request and the push fails a link the
    // patient has already been told about.
    expect(linkTokenIsFresh(daysAgo(165), now)).toBe(true);
    expect(linkTokenIsFresh(daysAgo(167), now)).toBe(false);
  });

  it('treats an expired token as gone', () => {
    expect(linkTokenIsFresh(daysAgo(200), now)).toBe(false);
  });

  it('has nothing to reuse when none was ever stored', () => {
    // This is the case that matters most: getting it wrong means asking ABDM
    // for a token on every push, and three in a day blocks the whole facility
    // for 24 hours.
    expect(linkTokenIsFresh(null, now)).toBe(false);
  });
});
