import { describe, it, expect } from 'vitest';

import { dropDeniedFindings } from './report';

// The last gate before a finding reaches a patient's chart.
//
// It is given two versions of the same consultation — the doctor's words, and
// the English the report was extracted from — and the order it reads them in is
// the whole behaviour. That order was wrong once, in production, and Penicillin
// went onto a chart as an allergy for a patient who had just denied it.

const HINDI = 'डॉक्टर: किसी दवा से एलर्जी? Penicillin वगैरह?\nमरीज़: Penicillin से एलर्जी नहीं है।';

describe('which version of the text decides', () => {
  it('lets the doctor\'s own words overrule the translation', () => {
    // Measured in production. The Hindi denies Penicillin; the English came back
    // as a reported question that names the drug with nothing negative near it.
    // Taking the safest answer across both — affirmation wins — kept the false
    // allergy. The words actually spoken decide.
    const english = 'The doctor asked about drug allergies such as Penicillin.';
    const report: Record<string, unknown> = { allergies: [{ allergy: 'Penicillin' }] };
    dropDeniedFindings(report, [HINDI, english]);
    expect(report.allergies).toEqual([]);
  });

  it('uses the English only where the original says nothing', () => {
    // The original may phrase a finding in a way the matcher cannot reach. Then
    // the English is the only reading available, and it is used.
    const report: Record<string, unknown> = { allergies: [{ allergy: 'Sulfa' }] };
    dropDeniedFindings(report, ['मरीज़ को बुखार है।', 'Patient denies any sulfa allergy.']);
    expect(report.allergies).toEqual([]);
  });

  it('keeps an allergy the doctor affirmed, whatever the translation says', () => {
    const report: Record<string, unknown> = { allergies: [{ allergy: 'Penicillin' }] };
    dropDeniedFindings(report, ['मरीज़: Penicillin से एलर्जी है।', 'No allergies reported.']);
    expect(report.allergies).toEqual([{ allergy: 'Penicillin' }]);
  });

  it('keeps a finding neither version mentions', () => {
    // Silence is not denial. The model may have read a paraphrase, and deleting
    // clinical content because a string comparison missed it is its own harm.
    const report: Record<string, unknown> = { allergies: [{ allergy: 'Ibuprofen' }] };
    dropDeniedFindings(report, ['मरीज़ को बुखार है।', 'Patient has fever.']);
    expect(report.allergies).toEqual([{ allergy: 'Ibuprofen' }]);
  });

  it('prunes denied diagnoses too, and leaves everything else alone', () => {
    const report: Record<string, unknown> = {
      diagnoses: [{ diagnosis: 'Asthma' }, { diagnosis: 'Dengue' }],
      prescribedMedications: [{ medicine: 'Paracetamol' }],
    };
    dropDeniedFindings(report, ['No history of asthma. Dengue suspected.', '']);
    expect(report.diagnoses).toEqual([{ diagnosis: 'Dengue' }]);
    expect(report.prescribedMedications).toEqual([{ medicine: 'Paracetamol' }]);
  });
});
