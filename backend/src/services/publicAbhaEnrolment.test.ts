import { describe, it, expect } from 'vitest';

import { ageFromYearOfBirth, readableGender } from './publicAbhaEnrolment.service';

describe('ageFromYearOfBirth', () => {
  const now = new Date('2026-09-08T00:00:00Z');

  it('turns ABDM’s year into the age we store', () => {
    expect(ageFromYearOfBirth('2002', now)).toBe(24);
    expect(ageFromYearOfBirth('2026', now)).toBe(0);
  });

  it('refuses what is not a year rather than storing a wrong age', () => {
    // This age REPLACES what the patient typed, so a wrong one is worse than
    // none: the form's value at least came from the person it describes.
    expect(ageFromYearOfBirth(null, now)).toBeNull();
    expect(ageFromYearOfBirth(undefined, now)).toBeNull();
    expect(ageFromYearOfBirth('', now)).toBeNull();
    expect(ageFromYearOfBirth('not a year', now)).toBeNull();
    expect(ageFromYearOfBirth('1899', now)).toBeNull();
    expect(ageFromYearOfBirth('2002.5', now)).toBeNull();
  });

  it('refuses a year that has not happened', () => {
    // A future year yields a negative age, which would pass an `age >= 0` check
    // written the obvious way round and then sit in a health record.
    expect(ageFromYearOfBirth('2030', now)).toBeNull();
  });
});

describe('readableGender', () => {
  it('turns ABDM’s letter into the word this app shows', () => {
    expect(readableGender('M')).toBe('Male');
    expect(readableGender('f')).toBe('Female');
    expect(readableGender('O')).toBe('Other');
    expect(readableGender('Male')).toBe('Male');
  });

  it('gives nothing for anything else, so the typed answer survives', () => {
    // The caller falls back to what the patient chose from the form's own list.
    // Inventing a value here would overwrite a real answer with a guess.
    expect(readableGender('')).toBeNull();
    expect(readableGender(null)).toBeNull();
    expect(readableGender('unknown')).toBeNull();
  });
});
