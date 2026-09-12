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
