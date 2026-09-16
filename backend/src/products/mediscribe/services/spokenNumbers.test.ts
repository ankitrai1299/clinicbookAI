import { describe, it, expect } from 'vitest';

import { normaliseSpokenNumbers } from './spokenNumbers';

// Numbers a doctor says out loud, written the way a chart needs them.
//
// The tests that matter most here are the ones asserting nothing else changes.
// A number converted in the wrong place is worse than one left in words: "one"
// in "one of the tablets" becoming "1" reads as a dose.

describe('doses', () => {
  it('converts a spoken dose', () => {
    expect(normaliseSpokenNumbers('Amlodipine five mg continue karna hai')).toBe(
      'Amlodipine 5 mg continue karna hai'
    );
  });

  it('converts a two-word dose', () => {
    expect(normaliseSpokenNumbers('Telmisartan forty mg raat ko')).toBe('Telmisartan 40 mg raat ko');
    expect(normaliseSpokenNumbers('Paracetamol six fifty mg')).toBe('Paracetamol 650 mg');
  });

  it('converts hundreds', () => {
    expect(normaliseSpokenNumbers('Metformin five hundred mg subah')).toBe('Metformin 500 mg subah');
    expect(normaliseSpokenNumbers('Azithromycin two hundred fifty mg')).toBe('Azithromycin 250 mg');
  });

  it('keeps the punctuation that followed', () => {
    expect(normaliseSpokenNumbers('Amlodipine five mg.')).toBe('Amlodipine 5 mg.');
  });

  it('converts a weight, which a paediatric dose depends on', () => {
    // Measured: a child's weight reached the report as "twelve kilograms", and
    // a dose calculated from a weight nobody can read as a number is not a
    // dose. Doctors say the unit in full far more often than they abbreviate it.
    expect(normaliseSpokenNumbers('weight is twelve kilograms')).toBe('weight is 12 kilograms');
    expect(normaliseSpokenNumbers('bachche ka wazan twelve kilo hai')).toBe('bachche ka wazan 12 kilo hai');
  });

  it('handles every unit a clinic uses', () => {
    expect(normaliseSpokenNumbers('ten ml syrup')).toBe('10 ml syrup');
    expect(normaliseSpokenNumbers('forty units insulin')).toBe('40 units insulin');
    expect(normaliseSpokenNumbers('five hundred mcg')).toBe('500 mcg');
  });
});

describe('blood pressure', () => {
  it('converts the way a BP is actually said', () => {
    // "one forty by ninety" is 140/90. Nobody means one, and then forty.
    expect(normaliseSpokenNumbers('BP kal se one forty by ninety aa raha hai')).toBe(
      'BP kal se 140/90 aa raha hai'
    );
  });

  it('converts a plain two-word reading', () => {
    expect(normaliseSpokenNumbers('BP one twenty by eighty hai')).toBe('BP 120/80 hai');
  });

  it('converts a spelled-out reading', () => {
    expect(normaliseSpokenNumbers('BP one hundred forty by ninety')).toBe('BP 140/90');
  });

  it('reads the separator a doctor actually uses', () => {
    // Measured on a real consultation: the report came out as "150 over 96
    // millimeters of mercury" — faithful to the speech and useless on a chart,
    // because nothing downstream can read that as a blood pressure.
    expect(normaliseSpokenNumbers('BP one fifty over ninety six hai')).toBe('BP 150/96 hai');
    expect(normaliseSpokenNumbers('ब्लड प्रेशर 150 बटे 96 hai')).toBe('ब्लड प्रेशर 150/96 hai');
  });
});

describe('what it must not touch', () => {
  it('leaves a duration alone', () => {
    // "Do din se bukhar hai" is two days of fever. "2 din" is not an
    // improvement, it is a rewrite of the patient's words for no clinical gain.
    const line = 'Patient ko two days se fever hai';
    expect(normaliseSpokenNumbers(line)).toBe(line);
  });

  it('leaves a bare number alone', () => {
    // No unit, no "by" — nothing says this is a measurement.
    expect(normaliseSpokenNumbers('one of the tablets missed ho gaya')).toBe(
      'one of the tablets missed ho gaya'
    );
    expect(normaliseSpokenNumbers('teen din tak lena hai')).toBe('teen din tak lena hai');
  });

  it('leaves Hindi and Devanagari untouched', () => {
    const line = 'दो दिन से पेट में तेज़ दर्द है';
    expect(normaliseSpokenNumbers(line)).toBe(line);
  });

  it('refuses a pair of numbers that is not a blood pressure', () => {
    // Digits make "45 by 2" look like a reading. Outside human range it stays as
    // spoken — an invented vital is worse than an unconverted one.
    expect(normaliseSpokenNumbers('tablet 45 by 2 lena hai')).toBe('tablet 45 by 2 lena hai');
    expect(normaliseSpokenNumbers('BP 90 by 140 hai')).toBe('BP 90 by 140 hai');
  });

  it('leaves digits that are already digits', () => {
    expect(normaliseSpokenNumbers('Paracetamol 650 mg twice daily')).toBe(
      'Paracetamol 650 mg twice daily'
    );
    expect(normaliseSpokenNumbers('BP 140/90 hai')).toBe('BP 140/90 hai');
  });

  it('does not treat "by" between non-numbers as a reading', () => {
    expect(normaliseSpokenNumbers('tablet by mouth lena hai')).toBe('tablet by mouth lena hai');
  });

  it('handles empty and whitespace input', () => {
    expect(normaliseSpokenNumbers('')).toBe('');
    expect(normaliseSpokenNumbers('   ')).toBe('');
  });
});

describe('a whole dictated line', () => {
  it('converts the measurements and nothing else', () => {
    expect(
      normaliseSpokenNumbers(
        'Patient ko two days se fever hai, BP one forty by ninety, Amlodipine five mg start karo'
      )
    ).toBe('Patient ko two days se fever hai, BP 140/90, Amlodipine 5 mg start karo');
  });
});
