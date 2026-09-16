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

  it('leaves a report with no orders alone', () => {
    const report: Record<string, unknown> = { allergies: [] };
    expect(() => dropDeniedFindings(report, ['', ''])).not.toThrow();
  });
});
