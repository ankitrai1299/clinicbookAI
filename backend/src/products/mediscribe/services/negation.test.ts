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

describe('a question is not an answer', () => {
  it('does not let the doctor asking about a drug affirm it', () => {
    // From a real consultation. The doctor's question names Penicillin and has
    // no "nahi" in it, so it counted as an affirmation and outvoted the
    // patient's denial on the very next line — Penicillin reached the chart as
    // an allergy.
    const line = 'डॉक्टर: किसी दवा से एलर्जी? Penicillin वगैरह?\nमरीज़: Penicillin से एलर्जी नहीं है।';
    expect(isDeniedIn(line, 'Penicillin')).toBe(true);
  });

  it('reads an English question the same way', () => {
    expect(isDeniedIn('Any penicillin allergy? No, no allergies.', 'penicillin')).not.toBe(false);
    expect(isDeniedIn('Do you have asthma? Patient denies asthma.', 'asthma')).toBe(true);
  });

  it('still hears an answer that follows the question', () => {
    // The affirmation is in the ANSWER, not the question, and must still win.
    expect(isDeniedIn('Koi allergy hai? Haan, Penicillin se allergy hai.', 'Penicillin')).toBe(false);
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

  it('does not let a "nahi" about ANOTHER drug erase the allergy', () => {
    // Measured. The doctor is explaining why they cannot use Amoxicillin — the
    // allergy is the REASON, stated as plainly as it can be — and the report
    // came back with no allergy at all. A patient whose penicillin allergy is
    // missing from the record gets given penicillin.
    const line = 'डॉक्टर: आपको Penicillin से एलर्जी है, तो Amoxicillin नहीं चलेगी।';
    expect(isDeniedIn(line, 'Penicillin')).toBe(false);
  });

  it('stops a denial at a comma', () => {
    // Same shape without the conjunction. Breaking more often can only move a
    // finding towards being kept, and between the two mistakes that is the one
    // a patient survives.
    expect(isDeniedIn('Penicillin se allergy hai, Amoxicillin nahi de sakte', 'Penicillin')).toBe(false);
  });

  it('still catches the denial it was built for', () => {
    // The commas and the new breaks must not have quietly disabled the guard.
    expect(isDeniedIn('Patient ko Penicillin se allergy nahi hai, aur sugar bhi nahi hai', 'Penicillin')).toBe(true);
  });

  it('handles empty input without claiming anything', () => {
    expect(isDeniedIn('', 'Penicillin')).toBeNull();
    expect(isDeniedIn('Patient has fever', '')).toBeNull();
  });
});
