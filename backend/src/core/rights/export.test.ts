import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { EXPORTED, NOT_PATIENT_DATA, summariseExport, type PatientExport } from './export.js';

// A data export is only worth having if it is complete, and "complete" is a
// claim about a schema that keeps changing.
//
// The failure this prevents: someone adds a table that stores something about a
// patient, ships it, and the export quietly stops being complete. Nothing looks
// wrong — the export still returns, still validates, still reads as
// authoritative — and the gap is discovered when a patient's data turns up
// somewhere the export said it did not exist.
//
// So the export's coverage is checked against schema.prisma itself, the same way
// tenant isolation is.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA = path.resolve(__dirname, '../../../prisma/schema.prisma');

/** Every model in the schema, with its body. */
const models = (): Array<{ name: string; body: string }> => {
  const schema = fs.readFileSync(SCHEMA, 'utf8');
  const out: Array<{ name: string; body: string }> = [];
  const re = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(schema))) out.push({ name: m[1], body: m[2] });
  return out;
};

/**
 * Can this table hold something about a patient?
 *
 * True when it carries a patientId, OR is keyed by a phone number — the second
 * case is the one that gets forgotten, because those tables (message logs,
 * session state) do not look patient-shaped in the schema.
 */
const holdsPatientData = (body: string): boolean =>
  /^\s*patientId\s/m.test(body) || /^\s*(phone|to)\s+String/m.test(body);

describe('the export covers every table that can hold patient data', () => {
  it('finds the models, so a broken parser cannot pass this vacuously', () => {
    const all = models();
    expect(all.length).toBeGreaterThan(25);
    expect(all.map((m) => m.name)).toContain('Appointment');
    expect(all.map((m) => m.name)).toContain('NovaDoc');
  });

  it('leaves no patient-bearing table unaccounted for', () => {
    const missing = models()
      .filter((m) => holdsPatientData(m.body))
      .map((m) => m.name)
      .filter((name) => !(name in EXPORTED) && !(name in NOT_PATIENT_DATA));

    expect(
      missing,
      'These tables can hold something about a patient, but the export neither ' +
        'includes them nor says why not. Add each to EXPORTED, or to ' +
        'NOT_PATIENT_DATA with the reason it holds nothing about a patient:\n  ' + missing.join('\n  ')
    ).toEqual([]);
  });

  it('accounts for EVERY table, not only the obviously patient-shaped ones', () => {
    // Wider than the rule above on purpose. A table with neither a patientId nor
    // a phone can still be about a patient — ConversationSession is exactly that
    // — and the only way to be sure is to have looked at all of them.
    const unclassified = models()
      .map((m) => m.name)
      .filter((name) => !(name in EXPORTED) && !(name in NOT_PATIENT_DATA));

    expect(
      unclassified,
      'Every table must be classified as patient data or not, so "complete" is a ' +
        'checked claim rather than a hopeful one:\n  ' + unclassified.join('\n  ')
    ).toEqual([]);
  });

  it('keeps the two lists disjoint', () => {
    const both = Object.keys(EXPORTED).filter((name) => name in NOT_PATIENT_DATA);
    expect(both, `listed as both exported and not-patient-data:\n  ${both.join('\n  ')}`).toEqual([]);
  });

  it('states a real reason for every exclusion', () => {
    const thin = Object.entries(NOT_PATIENT_DATA).filter(([, why]) => (why || '').trim().length < 15);
    expect(thin.map(([name]) => name), 'exclusions need a reason someone can check later').toEqual([]);
  });

  it('describes every included table in words the patient can read', () => {
    // The export is read by the person it is about, not by an engineer.
    const jargon = Object.entries(EXPORTED).filter(
      ([, note]) => (note || '').trim().length < 10 || /\bid\b|table|row|schema/i.test(note)
    );
    expect(jargon.map(([name]) => name), 'these descriptions read like schema notes').toEqual([]);
  });

  it('names only tables that actually exist', () => {
    // A stale entry would exempt a table that has been renamed — and the renamed
    // one would then be unaccounted for, which the checks above would catch, but
    // the misleading entry should go too.
    const real = new Set(models().map((m) => m.name));
    const ghosts = [...Object.keys(EXPORTED), ...Object.keys(NOT_PATIENT_DATA)].filter((n) => !real.has(n));
    expect(ghosts, `listed but not in the schema — delete them:\n  ${ghosts.join('\n  ')}`).toEqual([]);
  });
});

describe('the summary shown to the patient', () => {
  it('reports counts and never the data itself', () => {
    // This is what goes out over WhatsApp. A patient asking "what do you have?"
    // gets an inventory; the records themselves are handed over by the clinic,
    // because a chat window on a shared phone is not where a medical record
    // should land.
    const exported = {
      generatedAt: '2026-08-17T00:00:00.000Z',
      clinicId: 'c1',
      patientId: 'p1',
      contents: EXPORTED,
      notes: [],
      data: {
        Patient: { id: 'p1', name: 'Asha Kumari', phone: '917903884686' },
        Appointment: [{ id: 'a1' }, { id: 'a2' }],
        NovaDoc: [{ id: 'n1', report: { diagnosis: 'bronchitis' } }],
        Waitlist: []
      }
    } as unknown as PatientExport;

    const summary = summariseExport(exported);
    expect(summary).toEqual({ Patient: 1, Appointment: 2, NovaDoc: 1, Waitlist: 0 });

    const asText = JSON.stringify(summary);
    expect(asText).not.toContain('Asha');
    expect(asText).not.toContain('bronchitis');
    expect(asText).not.toContain('917903884686');
  });
});
