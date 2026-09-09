import { describe, it, expect } from 'vitest';

import {
  NEVER_AUTO_DELETED,
  RETENTION_RULES,
  cutoffFor,
  ruleIsAllowed
} from './retention.policy';

describe('the retention policy', () => {
  it('never ages out a clinical table', () => {
    // THE test in this file. Adding `patient` or `consultationNote` to
    // RETENTION_RULES would delete clinical records nightly and pass every
    // other test in the suite — the failure would show up as missing history
    // months later, with nothing to restore from.
    for (const rule of RETENTION_RULES) {
      expect(ruleIsAllowed(rule), `${rule.model} is on the never-auto-delete list`).toBe(true);
    }
  });

  it('keeps the two periods that are legal floors', () => {
    // The DPDP Rules require a year of logs for breach investigation. These are
    // not tuning knobs, and a future change that shortens them should have to
    // change this test and explain itself.
    const days = (model: string) => RETENTION_RULES.find((r) => r.model === model)?.days ?? 0;
    expect(days('securityAlert')).toBeGreaterThanOrEqual(365);
    expect(days('auditLog')).toBeGreaterThanOrEqual(365);
  });

  it('gives every rule a reason and a sane period', () => {
    for (const rule of RETENTION_RULES) {
      expect(rule.days, rule.model).toBeGreaterThan(0);
      // Ten years is not a retention policy, it is forgetting to have one.
      expect(rule.days, rule.model).toBeLessThanOrEqual(3650);
      expect(rule.why.length, `${rule.model} has no stated reason`).toBeGreaterThan(20);
      expect(rule.field.length, rule.model).toBeGreaterThan(0);
    }
  });

  it('lists no table twice', () => {
    const names = RETENTION_RULES.map((r) => r.model);
    expect(new Set(names).size).toBe(names.length);
  });

  it('says why each protected table is protected', () => {
    // The list is only useful if a person reading it can tell whether their
    // new table belongs on it.
    for (const [model, reason] of Object.entries(NEVER_AUTO_DELETED)) {
      expect(reason.length, `${model} is protected without a stated reason`).toBeGreaterThan(20);
    }
  });
});

describe('cutoffFor', () => {
  const now = new Date('2026-09-09T12:00:00Z');

  it('counts back from when the sweep runs', () => {
    expect(cutoffFor({ model: 'x', field: 'createdAt', days: 7, why: 'test' }, now).toISOString()).toBe(
      '2026-09-02T12:00:00.000Z'
    );
  });

  it('is always in the past', () => {
    for (const rule of RETENTION_RULES) {
      expect(cutoffFor(rule, now).getTime(), rule.model).toBeLessThan(now.getTime());
    }
  });
});
