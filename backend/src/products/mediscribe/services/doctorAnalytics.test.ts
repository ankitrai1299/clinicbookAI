import { describe, it, expect } from 'vitest';

import {
  buildDoctorAnalytics,
  withinRange,
  isFollowUpPending,
  parseDay,
  type CountableConsultation
} from './doctorAnalytics.js';

// The dashboard's six numbers. A wrong one here is not a crash — it is a doctor
// reading a confident figure that is simply untrue, and every card opens the
// list it counts, so a disagreement between the two is visible to them.

const at = (iso: string, extra: Partial<CountableConsultation> = {}): CountableConsultation => ({
  updatedAt: iso,
  status: 'Completed',
  ...extra
});

describe('which consultations fall inside a range', () => {
  // The bounds are LOCAL days — a clinic asking for "1st to 7th" means its own
  // calendar, not UTC's. These use local times so the assertion says what it
  // means wherever the suite runs.
  const local = (s: string, extra: Partial<CountableConsultation> = {}) => at(new Date(s).toISOString(), extra);

  it('includes the closing day, not just its first instant', () => {
    // "1st to 7th" means through the 7th. Treating the end as midnight would
    // silently drop a whole day of work — the day most likely to be looked at.
    expect(withinRange(local('2026-08-07T18:30:00'), parseDay('2026-08-01'), parseDay('2026-08-07'))).toBe(true);
    expect(withinRange(local('2026-08-07T23:59:00'), parseDay('2026-08-01'), parseDay('2026-08-07'))).toBe(true);
  });

  it('includes the opening day from its first instant', () => {
    expect(withinRange(local('2026-08-01T00:01:00'), parseDay('2026-08-01'), parseDay('2026-08-07'))).toBe(true);
  });

  it('excludes what falls outside either bound', () => {
    expect(withinRange(local('2026-07-31T23:00:00'), parseDay('2026-08-01'), parseDay('2026-08-07'))).toBe(false);
    expect(withinRange(local('2026-08-08T00:30:00'), parseDay('2026-08-01'), parseDay('2026-08-07'))).toBe(false);
  });

  it('keeps an unreadable date out of a bounded range but inside an unbounded one', () => {
    // We cannot claim it belongs to a period we can't place it in; but with no
    // period asked for, dropping it would under-report the doctor's own work.
    const broken: CountableConsultation = { status: 'Draft', date: 'sometime last week' };
    expect(withinRange(broken, parseDay('2026-08-01'), parseDay('2026-08-07'))).toBe(false);
    expect(withinRange(broken, null, null)).toBe(true);
  });

  it('reads the timestamp in the same order the rest of the app does', () => {
    // updatedAt → createdAt → display date. If this drifted, a figure would
    // disagree with the list it summarises.
    const c: CountableConsultation = { updatedAt: '2026-08-05T10:00:00Z', createdAt: '2026-01-01T10:00:00Z' };
    expect(withinRange(c, parseDay('2026-08-01'), parseDay('2026-08-07'))).toBe(true);
  });
});

describe('pending follow-ups', () => {
  const today = Date.parse('2026-08-11T00:00:00');

  it('counts one that is still ahead, and today itself', () => {
    expect(isFollowUpPending({ report: { followUp: { date: '2026-08-20' } } }, today)).toBe(true);
    expect(isFollowUpPending({ report: { followUp: { date: '2026-08-11' } } }, today)).toBe(true);
  });

  it('does not count one that has passed', () => {
    expect(isFollowUpPending({ report: { followUp: { date: '2026-08-01' } } }, today)).toBe(false);
  });

  it('counts a follow-up whose date cannot be read', () => {
    // "review in 2 weeks" is still a commitment the doctor made to a patient.
    // Dropping it because we cannot parse it would hide real work.
    expect(isFollowUpPending({ report: { followUp: { date: 'review in 2 weeks' } } }, today)).toBe(true);
  });

  it('counts nothing when no follow-up was set', () => {
    expect(isFollowUpPending({ report: { followUp: null } }, today)).toBe(false);
    expect(isFollowUpPending({}, today)).toBe(false);
  });
});

describe('the summary itself', () => {
  const now = new Date('2026-08-11T09:00:00');
  const week = { startDate: '2026-08-05', endDate: '2026-08-11', now };

  const sample: CountableConsultation[] = [
    at('2026-08-05T10:00:00Z'),
    at('2026-08-06T10:00:00Z', { status: 'Draft' }),
    at('2026-08-07T10:00:00Z', { report: { followUp: { date: '2026-08-25' } } }),
    at('2026-08-11T08:00:00Z'),
    at('2026-07-01T10:00:00Z') // outside the window
  ];

  it('counts totals, completions and drafts over the window only', () => {
    const a = buildDoctorAnalytics(sample, week);
    expect(a.totalConsultations).toBe(4);
    expect(a.completedReports).toBe(3);
    expect(a.draftReports).toBe(1);
    expect(a.pendingFollowUps).toBe(1);
  });

  it('counts the range inclusively — the 5th to the 11th is seven days', () => {
    expect(buildDoctorAnalytics(sample, week).days).toBe(7);
    expect(buildDoctorAnalytics(sample, { startDate: '2026-08-11', endDate: '2026-08-11', now }).days).toBe(1);
  });

  it('reports rates without inventing a denominator', () => {
    const a = buildDoctorAnalytics(sample, week);
    expect(a.completionRate).toBe(75);
    expect(a.averagePerDay).toBeCloseTo(0.6, 1);

    // Nothing to divide: zero, never NaN or Infinity on a doctor's screen.
    const empty = buildDoctorAnalytics([], week);
    expect(empty.completionRate).toBe(0);
    expect(empty.averagePerDay).toBe(0);
  });

  it('gives no per-day average when no period was asked for', () => {
    // There is no meaningful denominator for "all time", and a made-up one
    // would read as a real figure.
    const a = buildDoctorAnalytics(sample, { now });
    expect(a.totalConsultations).toBe(5);
    expect(a.days).toBe(0);
    expect(a.averagePerDay).toBe(0);
    expect(a.startDate).toBeNull();
  });

  it('echoes back the range it actually used', () => {
    const a = buildDoctorAnalytics(sample, week);
    expect(a.startDate).toBe('2026-08-05');
    expect(a.endDate).toBe('2026-08-11');
  });
});
