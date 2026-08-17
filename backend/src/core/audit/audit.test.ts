import { describe, it, expect } from 'vitest';

import { redactMetadata, maskPhone, MAX_VALUE_LENGTH, isClinicalKey } from './audit.redact.js';
import { hashEntry, canonicalise, verifyChain, type ChainRow, type HashableEntry } from './audit.hash.js';
import { AUDIT_ACTIONS } from './audit.actions.js';

// Two properties decide whether this audit trail is an asset or a liability:
// it must not become a second copy of the medical record, and it must be
// possible to tell whether it has been altered.

describe('what may be stored in an audit row', () => {
  it('drops clinical content even when a caller passes it', () => {
    // The realistic failure: someone adds `metadata: { ...report }` in a hurry
    // and the audit table quietly starts holding diagnoses.
    const out = redactMetadata({
      consultationId: 'c-1',
      transcript: 'patient says he has chest pain since Tuesday',
      report: 'Acute bronchitis',
      prescribedMedications: 'Amoxicillin 500mg',
      diagnosis: 'bronchitis',
      notes: 'follow up in 3 days',
      medicineCount: 3
    });

    expect(out).toEqual({ consultationId: 'c-1', medicineCount: 3 });
  });

  it('drops secrets as firmly as it drops clinical text', () => {
    const out = redactMetadata({ password: 'hunter2', token: 'ey…', apiKey: 'ck_live_x', name: 'ok' });
    expect(out).toEqual({ name: 'ok' });
  });

  it('recognises a clinical key however it is spelled', () => {
    for (const key of ['transcript', 'fullTranscript', 'report_text', 'REPORT', 'patientNotes', 'chiefComplaint']) {
      expect(isClinicalKey(key), key).toBe(true);
    }
    expect(isClinicalKey('consultationId')).toBe(false);
    expect(isClinicalKey('count')).toBe(false);
  });

  it('keeps only primitives, so free text cannot arrive nested', () => {
    const out = redactMetadata({
      ok: 'yes',
      n: 4,
      flag: true,
      nested: { transcript: 'hidden in here' },
      list: ['also', 'here'],
      nothing: null,
      blank: ''
    });
    expect(out).toEqual({ ok: 'yes', n: 4, flag: true });
  });

  it('caps a long value rather than storing it whole', () => {
    const out = redactMetadata({ filename: 'x'.repeat(500) });
    expect(String(out?.filename).length).toBe(MAX_VALUE_LENGTH + 1); // + the ellipsis
  });

  it('returns undefined rather than an empty object', () => {
    expect(redactMetadata({ transcript: 'all of it' })).toBeUndefined();
    expect(redactMetadata(null)).toBeUndefined();
    expect(redactMetadata('a string')).toBeUndefined();
    expect(redactMetadata(['a', 'list'])).toBeUndefined();
  });

  it('masks a phone number down to something correlatable but not personal', () => {
    expect(maskPhone('+91 98765 43210')).toBe('********3210');
    expect(maskPhone('123')).toBe('***');
    expect(maskPhone('')).toBeUndefined();
  });
});

describe('the action vocabulary', () => {
  it('is a closed list with no duplicates', () => {
    expect(new Set(AUDIT_ACTIONS).size).toBe(AUDIT_ACTIONS.length);
  });

  it('covers the events this phase was asked to make answerable', () => {
    for (const action of [
      'PATIENT_VIEWED',
      'PATIENT_DELETED',
      'APPOINTMENT_CANCELLED',
      'RECORDING_ACCESSED',
      'RECORDING_DELETED',
      'AI_TRANSCRIPT_GENERATED',
      'AI_SUMMARY_GENERATED',
      'AI_PRESCRIPTION_DRAFT_CREATED',
      'PRESCRIPTION_APPROVED',
      'PRESCRIPTION_SENT',
      'DOCUMENT_DOWNLOADED',
      'LOGIN',
      'FAILED_LOGIN',
      'CONSENT_GRANTED',
      'CONSENT_WITHDRAWN'
    ] as const) {
      expect(AUDIT_ACTIONS, action).toContain(action);
    }
  });
});

// ── Tamper evidence ─────────────────────────────────────────────────────────

const entry = (over: Partial<HashableEntry> = {}): HashableEntry => ({
  clinicId: 'c1',
  actorId: 'u1',
  actorType: 'user',
  actorRole: 'hospital_admin',
  action: 'PATIENT_VIEWED',
  resourceType: 'patient',
  resourceId: 'p1',
  patientId: 'p1',
  outcome: 'success',
  reason: null,
  metadata: null,
  createdAt: new Date('2026-08-17T10:00:00.000Z'),
  ...over
});

/** Build a valid chain, the way the writer does. */
const chain = (entries: HashableEntry[]): ChainRow[] => {
  const rows: ChainRow[] = [];
  let prev: string | null = null;
  entries.forEach((e, i) => {
    const hash = hashEntry(e, prev);
    rows.push({ ...e, id: `r${i}`, prevHash: prev, hash });
    prev = hash;
  });
  return rows;
};

describe('tamper evidence', () => {
  it('hashes the same row the same way regardless of key order', () => {
    // Verification a year from now depends on this and nothing else.
    const a = canonicalise(entry({ metadata: { b: 2, a: 1 } }));
    const b = canonicalise(entry({ metadata: { a: 1, b: 2 } }));
    expect(a).toBe(b);
  });

  it('accepts an untouched chain', () => {
    const rows = chain([entry(), entry({ action: 'PATIENT_UPDATED' }), entry({ action: 'PATIENT_DELETED' })]);
    expect(verifyChain(rows)).toEqual([]);
  });

  it('catches a row whose content was edited in place', () => {
    // Someone changes who did it, in the database, after the fact.
    const rows = chain([entry(), entry({ actorId: 'u2', action: 'PATIENT_DELETED' })]);
    rows[1].actorId = 'someone-else';

    const problems = verifyChain(rows);
    expect(problems).toContainEqual({ id: 'r1', problem: 'content-altered' });
  });

  it('catches a deleted row by the gap it leaves', () => {
    // Deleting the incriminating row is the more likely attempt than editing it.
    const rows = chain([entry(), entry({ action: 'PATIENT_DELETED' }), entry({ action: 'PATIENT_VIEWED' })]);
    const withoutMiddle = [rows[0], rows[2]];

    const problems = verifyChain(withoutMiddle);
    expect(problems.some((p) => p.problem === 'broken-link' && p.id === 'r2')).toBe(true);
  });

  it('catches an edit even when the editor recomputes that row’s own hash', () => {
    // The chain's actual purpose: fixing one row is not enough, because the next
    // row committed to the old hash.
    const rows = chain([entry(), entry({ action: 'PATIENT_DELETED' }), entry({ action: 'LOGIN' })]);
    rows[1].actorId = 'someone-else';
    rows[1].hash = hashEntry(rows[1], rows[1].prevHash); // recomputed, looks valid alone

    const problems = verifyChain(rows);
    expect(problems.some((p) => p.id === 'r1' && p.problem === 'content-altered')).toBe(false);
    // …but r2 still points at the hash r1 used to have, which no longer exists.
    expect(problems).toContainEqual({ id: 'r2', problem: 'broken-link', missingPrevHash: rows[2].prevHash! });
  });

  it('does not flag the first row of a chain for having no predecessor', () => {
    expect(verifyChain(chain([entry()]))).toEqual([]);
  });
});
