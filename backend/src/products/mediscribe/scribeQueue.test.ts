import { describe, it, expect } from 'vitest';
import { AppointmentStatus } from '@prisma/client';

import { belongsOnQueue, QUEUE_STATUSES } from './clinicData';

// The rule deciding whether a booked patient is REACHABLE by their doctor or
// invisible to them.
//
// It was written after a real failure. A visit booked for 12:00 was swept to
// NO_SHOW an hour later by the auto-complete cron, and the doctor's queue showed
// only PENDING and CONFIRMED — so the patient vanished from the one screen meant
// to bring them to the doctor, and could no longer be scribed at all. The doctor
// was simply running late, which in an OPD is most days.

const TODAY = '2026-09-12';
const TOMORROW = '2026-09-13';

describe('belongsOnQueue — today', () => {
  it('keeps a visit the sweep marked no-show', () => {
    // The case that broke: an hour late is not evidence the patient never came.
    expect(belongsOnQueue(AppointmentStatus.NO_SHOW, TODAY, TODAY)).toBe(true);
  });

  it('keeps a visit already written up', () => {
    // Asked for explicitly: after the scribe is finished it must still be seen,
    // otherwise the doctor cannot tell a done patient from one never seen.
    expect(belongsOnQueue(AppointmentStatus.COMPLETED, TODAY, TODAY)).toBe(true);
  });

  it('keeps the ordinary live ones', () => {
    expect(belongsOnQueue(AppointmentStatus.PENDING, TODAY, TODAY)).toBe(true);
    expect(belongsOnQueue(AppointmentStatus.CONFIRMED, TODAY, TODAY)).toBe(true);
  });

  it('drops a cancellation', () => {
    // The one real exclusion. That visit is not happening, and showing it as
    // merely delayed would be a lie rather than patience.
    expect(belongsOnQueue(AppointmentStatus.CANCELLED, TODAY, TODAY)).toBe(false);
  });
});

describe('belongsOnQueue — later days', () => {
  it('shows only what is still live', () => {
    expect(belongsOnQueue(AppointmentStatus.PENDING, TOMORROW, TODAY)).toBe(true);
    expect(belongsOnQueue(AppointmentStatus.CONFIRMED, TOMORROW, TODAY)).toBe(true);
  });

  it('never shows a no-show or a completed visit on a later day', () => {
    // Tomorrow has no "missed" and no "done"; either would be nonsense on a
    // date that has not happened.
    expect(belongsOnQueue(AppointmentStatus.NO_SHOW, TOMORROW, TODAY)).toBe(false);
    expect(belongsOnQueue(AppointmentStatus.COMPLETED, TOMORROW, TODAY)).toBe(false);
  });
});

describe('QUEUE_STATUSES', () => {
  it('asks the database for everything the rule can keep', () => {
    // If a status the rule accepts is missing here, the row never reaches the
    // rule and the bug comes back silently.
    for (const s of [
      AppointmentStatus.PENDING,
      AppointmentStatus.CONFIRMED,
      AppointmentStatus.NO_SHOW,
      AppointmentStatus.COMPLETED
    ]) {
      expect(QUEUE_STATUSES, s).toContain(s);
    }
  });

  it('never asks for cancellations', () => {
    expect(QUEUE_STATUSES).not.toContain(AppointmentStatus.CANCELLED);
  });
});

// ── The scribe window ──────────────────────────────────────────────────────
//
// The clinic's rule, in their words: a 3:00 appointment that runs to 3:30 can be
// scribed between 3:00 and 3:30, and Start is not offered outside that.

import { scribeWindow } from './clinicData';

const at = (hhmm: string) => new Date(`2026-09-12T${hhmm}:00.000Z`);
const OPENS = '2026-09-12T15:00:00.000Z';
const CLOSES = '2026-09-12T15:30:00.000Z';

describe('scribeWindow', () => {
  it('is open from the first second of the slot', () => {
    expect(scribeWindow(OPENS, CLOSES, at('15:00'))).toBe('open');
  });

  it('is open all the way through it', () => {
    expect(scribeWindow(OPENS, CLOSES, at('15:29'))).toBe('open');
  });

  it('is not open a minute early', () => {
    expect(scribeWindow(OPENS, CLOSES, at('14:59'))).toBe('early');
  });

  it('closes exactly at the end, not a second later', () => {
    // The boundary is the half of this that people argue about, so it is pinned:
    // 15:30 belongs to the next slot, not this one.
    expect(scribeWindow(OPENS, CLOSES, at('15:30'))).toBe('closed');
  });

  it('stays closed afterwards', () => {
    expect(scribeWindow(OPENS, CLOSES, at('18:00'))).toBe('closed');
  });

  it('opens rather than locks out when the times are unusable', () => {
    // Deliberately the safe direction. A doctor who cannot record the patient in
    // front of them is worse than one recording slightly outside the window.
    for (const bad of ['', 'tomorrow', undefined]) {
      expect(scribeWindow(bad, CLOSES, at('18:00')), String(bad)).toBe('open');
      expect(scribeWindow(OPENS, bad, at('18:00')), String(bad)).toBe('open');
    }
  });
});
