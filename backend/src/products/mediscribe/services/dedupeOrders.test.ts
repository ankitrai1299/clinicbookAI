import { describe, it, expect } from 'vitest';

import { dropDeniedFindings } from './report';

// Deduping runs inside dropDeniedFindings, on the way to the chart.
//
// The measured case: a doctor reading the order list back at the end of the
// visit, so every test appears once from the middle of the consultation and
// once from the summary.

const orders = (report: Record<string, unknown>) =>
  ((report.ordersDiagnostics as any[]) ?? []).flatMap((c) => c.findings ?? []);

describe('repeated orders', () => {
  it('removes a test listed twice under the same name', () => {
    const report: Record<string, unknown> = {
      ordersDiagnostics: [
        { name: 'Laboratory Orders', findings: ['CBC', 'HbA1c', 'Urine routine', 'HbA1c', 'urine  Routine.'] },
      ],
    };
    dropDeniedFindings(report, ['', '']);
    expect(orders(report)).toEqual(['CBC', 'HbA1c', 'Urine routine']);
  });

  it('removes a repeat that landed in a different category', () => {
    const report: Record<string, unknown> = {
      ordersDiagnostics: [
        { name: 'Laboratory Orders', findings: ['CBC'] },
        { name: 'Other Diagnostic Tests', findings: ['CBC'] },
      ],
    };
    dropDeniedFindings(report, ['', '']);
    expect(orders(report)).toEqual(['CBC']);
  });

  it('keeps two tests that merely share a word', () => {
    // The rule that would merge "Widal" into "Widal test" also merges "Blood
    // sugar" into "Fasting blood sugar", and those are two different tests. An
    // untidy list costs a doctor a glance; a test removed from it does not get
    // done.
    const report: Record<string, unknown> = {
      ordersDiagnostics: [
        { name: 'Laboratory Orders', findings: ['Widal', 'Widal test', 'Blood sugar', 'Fasting blood sugar'] },
        { name: 'Imaging Orders', findings: ['Chest X-ray', 'X-ray of the knees'] },
      ],
    };
    dropDeniedFindings(report, ['', '']);
    expect(orders(report)).toEqual([
      'Widal', 'Widal test', 'Blood sugar', 'Fasting blood sugar', 'Chest X-ray', 'X-ray of the knees',
    ]);
  });

  it('drops a test the doctor said was NOT needed', () => {
    // Measured on a real consultation. The doctor explained why the chest X-ray
    // was unnecessary, and the report ordered it anyway — so the patient goes
    // and has it done. Nothing in the visit asked for it.
    const said = 'छाती का X-ray अभी ज़रूरत नहीं है, छाती साफ़ है।';
    const english = 'A chest X-ray is not needed right now; the chest is clear. CBC and HbA1c ordered.';
    const report: Record<string, unknown> = {
      ordersDiagnostics: [
        { name: 'Imaging Orders', findings: ['Chest X-ray'] },
        { name: 'Laboratory Orders', findings: ['CBC', 'HbA1c'] },
      ],
    };
    dropDeniedFindings(report, [said, english]);
    expect(orders(report)).toEqual(['CBC', 'HbA1c']);
  });

  it('keeps a test that was declined now but planned for later', () => {
    // "अभी घुटने की जाँच नहीं करेंगे, बुखार उतरने के बाद X-ray करा लेंगे" is an
    // order, just not for today. An affirmation anywhere keeps it — the doctor
    // deletes what they do not want, and cannot restore what was never shown.
    const said = 'अभी घुटने की जाँच नहीं करेंगे। बुखार उतरने के बाद X-ray करा लेंगे।';
    const report: Record<string, unknown> = {
      ordersDiagnostics: [{ name: 'Imaging Orders', findings: ['X-ray'] }],
    };
    dropDeniedFindings(report, [said, '']);
    expect(orders(report)).toEqual(['X-ray']);
  });

  it('never drops an order over a dose limit', () => {
    // "तीन बार से ज़्यादा नहीं" limits how often, not whether. A rule that reads
    // that "नहीं" as a denial deletes a real instruction.
    const said = 'CBC कराइए। Paracetamol दिन में तीन बार से ज़्यादा नहीं।';
    const report: Record<string, unknown> = {
      ordersDiagnostics: [{ name: 'Laboratory Orders', findings: ['CBC'] }],
      prescribedMedications: [{ medicine: 'Paracetamol', strength: '650 mg' }],
    };
    dropDeniedFindings(report, [said, '']);
    expect(orders(report)).toEqual(['CBC']);
    expect(report.prescribedMedications).toEqual([{ medicine: 'Paracetamol', strength: '650 mg' }]);
  });

  it('fixes a drug name the report model corrupted', () => {
    // The transcript spelled it correctly. The corruption was introduced by the
    // extraction, downstream of every check on the way in, and went onto a
    // prescription.
    const report: Record<string, unknown> = {
      prescribedMedications: [{ medicine: 'Levocetirizizine', strength: '5 mg' }],
      medicationHistory: [{ medicine: 'Metformal', strength: '500 mg' }],
      allergies: [{ allergy: 'Penicilin' }],
    };
    dropDeniedFindings(report, ['', '']);
    expect((report.prescribedMedications as any)[0].medicine).toBe('Levocetirizine');
    expect((report.medicationHistory as any)[0].medicine).toBe('Metformin');
    expect((report.allergies as any)[0].allergy).toBe('Penicillin');
  });

  it('leaves a name it does not recognise exactly as the doctor said it', () => {
    // A glossary that guesses at an unknown word is worse than one that stays
    // out of the way — the doctor can read an unfamiliar spelling, but cannot
    // know that a familiar one is not what they said.
    const report: Record<string, unknown> = {
      prescribedMedications: [{ medicine: 'Zyrtec-D', strength: '' }],
    };
    dropDeniedFindings(report, ['', '']);
    expect((report.prescribedMedications as any)[0].medicine).toBe('Zyrtec-D');
  });

  it('leaves a report with no orders alone', () => {
    const report: Record<string, unknown> = { allergies: [] };
    expect(() => dropDeniedFindings(report, ['', ''])).not.toThrow();
  });
});
