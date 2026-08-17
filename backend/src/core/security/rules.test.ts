import { describe, it, expect } from 'vitest';

import { evaluate, DEFAULT_THRESHOLDS, type AuditRow } from './rules.js';

// Half of these tests are about what must NOT fire.
//
// A detection rule has two failure modes and only one of them is obvious. The
// obvious one is missing a real attack. The other — firing on a busy Monday
// morning — is the one that actually happens, and it kills the whole system:
// people mute the alert, and a muted alert looks like coverage while providing
// none. So every rule is tested against the innocent behaviour it most
// resembles.

const WINDOW_START = new Date('2026-08-17T10:00:00.000Z');

let seq = 0;
const row = (over: Partial<AuditRow> = {}): AuditRow => ({
  id: `a${seq++}`,
  clinicId: 'c1',
  actorId: 'u1',
  actorRole: 'receptionist',
  action: 'PATIENT_VIEWED',
  outcome: 'success',
  patientId: null,
  resourceId: null,
  ip: '1.2.3.4',
  metadata: null,
  createdAt: new Date('2026-08-17T10:05:00.000Z'),
  ...over
});

const many = (n: number, fn: (i: number) => Partial<AuditRow>): AuditRow[] =>
  Array.from({ length: n }, (_, i) => row(fn(i)));

const ruleNames = (rows: AuditRow[]) => evaluate(rows, WINDOW_START).map((f) => f.rule);

describe('failed sign-ins', () => {
  const failed = (n: number, email: string, ip = '1.2.3.4') =>
    many(n, () => ({ action: 'FAILED_LOGIN', outcome: 'failure', clinicId: null, actorId: null, ip, metadata: { email } }));

  it('fires on a burst against one email', () => {
    expect(ruleNames(failed(DEFAULT_THRESHOLDS.failedLogins, 'owner@clinic.in'))).toContain('failed_logins');
  });

  it('stays quiet for someone who forgot their password', () => {
    // Four tries and then the reset link. This is the single most common
    // innocent pattern and it must never page anyone.
    expect(ruleNames(failed(4, 'owner@clinic.in'))).toEqual([]);
  });

  it('does not add up failures across DIFFERENT accounts', () => {
    // Twelve people each mistyping once on a Monday is not an attack. Counting
    // per-email rather than in total is what separates them.
    const rows = many(12, (i) => ({
      action: 'FAILED_LOGIN',
      outcome: 'failure',
      clinicId: null,
      metadata: { email: `user${i}@clinic.in` }
    }));
    expect(ruleNames(rows)).toEqual([]);
  });

  it('treats a burst from several addresses as more serious', () => {
    // One person at one desk is a forgetful human; the same email hit from many
    // addresses is credential stuffing.
    const oneIp = evaluate(failed(12, 'owner@clinic.in', '1.1.1.1'), WINDOW_START)[0];
    const manyIps = evaluate(
      many(12, (i) => ({
        action: 'FAILED_LOGIN',
        outcome: 'failure',
        clinicId: null,
        ip: `10.0.0.${i}`,
        metadata: { email: 'owner@clinic.in' }
      })),
      WINDOW_START
    )[0];

    expect(oneIp.severity).toBe('medium');
    expect(manyIps.severity).toBe('high');
  });
});

describe('refused requests', () => {
  const denied = (n: number, actorId: string, routes = 1) =>
    many(n, (i) => ({
      action: 'AUTHORIZATION_DENIED',
      outcome: 'denied',
      actorId,
      resourceId: `GET /api/route${i % routes}`
    }));

  it('fires when one account is walking the API', () => {
    expect(ruleNames(denied(DEFAULT_THRESHOLDS.denials, 'u9', 6))).toContain('denials');
  });

  it('stays quiet for a receptionist who hit a wall twice and gave up', () => {
    // The expected outcome of Phase 2's RBAC for a role that changed: a couple
    // of 403s and a phone call to the admin.
    expect(ruleNames(denied(2, 'u9'))).toEqual([]);
  });

  it('is more serious when many different endpoints are involved', () => {
    // Hammering ONE endpoint is usually a UI that has not caught up. Sweeping
    // across several is someone looking for a gap.
    const oneRoute = evaluate(denied(20, 'u9', 1), WINDOW_START)[0];
    const manyRoutes = evaluate(denied(20, 'u9', 8), WINDOW_START)[0];
    expect(oneRoute.severity).toBe('medium');
    expect(manyRoutes.severity).toBe('high');
  });
});

describe('one account reading many patients', () => {
  it('fires on a sweep of distinct records', () => {
    const rows = many(DEFAULT_THRESHOLDS.patientReads, (i) => ({ patientId: `p${i}` }));
    expect(ruleNames(rows)).toContain('patient_sweep');
  });

  it('stays quiet for a busy front desk', () => {
    // Twenty patients in a morning is a normal clinic; the window here is
    // minutes, so this is already generous.
    expect(ruleNames(many(20, (i) => ({ patientId: `p${i}` })))).toEqual([]);
  });

  it('does not count the same patient opened repeatedly', () => {
    // Reception opens one record, edits it, opens it again. Counting reads
    // rather than DISTINCT patients would fire on exactly that.
    expect(ruleNames(many(60, () => ({ patientId: 'p1' })))).toEqual([]);
  });

  it('does not add up reads across different staff', () => {
    // A whole clinic's morning is not one person exfiltrating.
    const rows = many(60, (i) => ({ actorId: `u${i % 6}`, patientId: `p${i}` }));
    expect(ruleNames(rows)).toEqual([]);
  });
});

describe('one account opening many recordings', () => {
  it('fires on a handful in one window', () => {
    const rows = many(DEFAULT_THRESHOLDS.recordingReads, (i) => ({
      action: 'RECORDING_ACCESSED',
      resourceId: `key${i}`
    }));
    expect(ruleNames(rows)).toContain('recording_sweep');
  });

  it('stays quiet for a doctor listening back to one visit', () => {
    expect(ruleNames(many(2, () => ({ action: 'RECORDING_ACCESSED' })))).toEqual([]);
  });
});

describe('destructive bursts', () => {
  it('fires on several deletions by one account', () => {
    const rows = many(3, () => ({ action: 'PATIENT_DELETED' }));
    expect(ruleNames(rows)).toContain('destructive_burst');
  });

  it('stays quiet for a single deliberate deletion', () => {
    expect(ruleNames([row({ action: 'PATIENT_DELETED' })])).toEqual([]);
  });

  it('does not count a deletion that was refused', () => {
    // A 403 on delete is the RBAC working, not a destruction.
    const rows = many(5, () => ({ action: 'PATIENT_DELETED', outcome: 'denied' }));
    expect(ruleNames(rows)).toEqual([]);
  });

  it('is only medium, because a clinic tidying records looks identical', () => {
    const finding = evaluate(many(4, () => ({ action: 'RECORDING_DELETED' })), WINDOW_START)[0];
    expect(finding.severity).toBe('medium');
    // Phrased as a question, because it is one.
    expect(finding.summary).toContain('Was this intended?');
  });
});

describe('the findings themselves', () => {
  it('carry nothing clinical or personal beyond what an investigator needs', () => {
    const rows = [
      ...many(DEFAULT_THRESHOLDS.patientReads, (i) => ({ patientId: `p${i}` })),
      ...many(DEFAULT_THRESHOLDS.recordingReads, () => ({ action: 'RECORDING_ACCESSED' }))
    ];
    for (const f of evaluate(rows, WINDOW_START)) {
      // Counts and ids only — never a patient id list, a name, or any content.
      for (const value of Object.values(f.detail)) {
        expect(typeof value === 'string' || typeof value === 'number').toBe(true);
      }
      expect(f.summary).not.toMatch(/\bp\d+\b/);
    }
  });

  it('dedupe by rule, subject and window, so one burst alerts once', () => {
    const rows = many(DEFAULT_THRESHOLDS.patientReads, (i) => ({ patientId: `p${i}` }));
    const first = evaluate(rows, WINDOW_START)[0];
    // The SAME window, scanned again ten minutes later because the windows
    // overlap — must produce the same key, or the overlap becomes a duplicate.
    const second = evaluate(rows, WINDOW_START)[0];
    expect(first.dedupeKey).toBe(second.dedupeKey);

    const laterWindow = evaluate(rows, new Date('2026-08-17T11:00:00.000Z'))[0];
    expect(laterWindow.dedupeKey).not.toBe(first.dedupeKey);
  });

  it('put the most serious first', () => {
    const rows = [
      ...many(4, () => ({ action: 'PATIENT_DELETED' })), // medium
      ...many(DEFAULT_THRESHOLDS.patientReads, (i) => ({ patientId: `p${i}` })) // high
    ];
    expect(evaluate(rows, WINDOW_START)[0].severity).toBe('high');
  });

  it('finds nothing in an empty or ordinary window', () => {
    expect(evaluate([], WINDOW_START)).toEqual([]);
    // A realistic quiet ten minutes: a few reads, a login, one booking.
    const ordinary = [
      row({ action: 'LOGIN' }),
      row({ patientId: 'p1' }),
      row({ patientId: 'p2' }),
      row({ action: 'APPOINTMENT_CREATED' }),
      row({ action: 'PATIENT_UPDATED', patientId: 'p1' })
    ];
    expect(evaluate(ordinary, WINDOW_START)).toEqual([]);
  });

  it('honours tuned thresholds without changing the rules', () => {
    const rows = many(6, (i) => ({ patientId: `p${i}` }));
    expect(evaluate(rows, WINDOW_START)).toEqual([]);
    expect(evaluate(rows, WINDOW_START, { ...DEFAULT_THRESHOLDS, patientReads: 5 })[0].rule).toBe('patient_sweep');
  });
});
