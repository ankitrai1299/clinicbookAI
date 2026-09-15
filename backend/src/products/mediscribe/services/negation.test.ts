import { describe, it, expect } from 'vitest';

import { isDeniedIn } from './negation';

// The guard that keeps a denied finding out of a patient's record.
//
// It exists because prompting failed. Given "Patient ko Penicillin se allergy
// NAHI hai", both available models produced a report listing Penicillin as an
// allergy — and kept doing it after the prompt was given an explicit rule about
// negation, in capitals, with examples in both languages.
//
// Two ways to be wrong here and they are not equal. Keeping a denied allergy
// denies a patient the right antibiotic for years. Dropping a real one is worse
// still — it hands them a drug that could kill them. So the tests below care
// most about the second: everything this must NOT remove.

describe('a denial is caught', () => {
  it('reads the case this was built for', () => {
    expect(isDeniedIn('Patient ko Penicillin se allergy nahi hai', 'Penicillin')).toBe(true);
  });

  it('reads English denial', () => {
    expect(isDeniedIn('Patient denies any penicillin allergy', 'penicillin')).toBe(true);
    expect(isDeniedIn('No history of asthma', 'asthma')).toBe(true);
  });

  it('reads Devanagari denial', () => {
    expect(isDeniedIn('मरीज़ को पेनिसिलिन से एलर्जी नहीं है', 'पेनिसिलिन')).toBe(true);
  });

  it('reads across scripts, because the engine switches them', () => {
    // The same Hindi came back as "बुखार" on one run and "bukhaar" on another.
    // A guard that knows only one spelling protects only half the consultations.
    expect(isDeniedIn('मरीज़ को पेनिसिलिन से एलर्जी नहीं है', 'Penicillin')).toBe(true);
    expect(isDeniedIn('Penicillin se allergy nahi hai', 'पेनिसिलिन')).toBe(true);
  });
});

describe('what it must never remove', () => {
  it('leaves a finding that was affirmed', () => {
    expect(isDeniedIn('Patient ko Penicillin se allergy hai', 'Penicillin')).toBe(false);
  });

  it('does not let one clause negate the next', () => {
    // "nahi" belongs to the chest pain. Taking the diabetes out of a diabetic's
    // record because of it would be the guard causing the harm it prevents.
    const line = 'Chest pain nahi hai lekin sugar hai';
    expect(isDeniedIn(line, 'chest pain')).toBe(true);
    expect(isDeniedIn(line, 'sugar')).toBe(false);
  });

  it('keeps a finding the transcript never mentions', () => {
    // Null, not "denied". The model may have read a paraphrase this cannot
    // match, and deleting clinical content because a string comparison missed it
    // is its own kind of harm.
    expect(isDeniedIn('Patient has fever and cough', 'Penicillin')).toBeNull();
  });

  it('keeps a finding that was denied once and then affirmed', () => {
    // A correction mid-consultation. The safe reading of a contradiction about
    // an allergy is that the allergy is real.
    expect(isDeniedIn('Allergy nahi hai. Sorry, allergy hai Penicillin se.', 'allergy')).toBe(false);
  });

  it('handles empty input without claiming anything', () => {
    expect(isDeniedIn('', 'Penicillin')).toBeNull();
    expect(isDeniedIn('Patient has fever', '')).toBeNull();
  });
});
