import { describe, it, expect } from 'vitest';

// The pure half of the auto-complete sweep: when does a booked slot END?
// Everything else the cron does hangs off this one comparison — get it wrong and
// visits either close while the patient is still in the room, or never close at
// all. Clinic time is Asia/Kolkata (UTC+5:30).
import { slotEndInstant } from './autoCompleteVisits.service';

// Appointment dates are stored at midnight UTC (see normalizeDate).
const day = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

describe('slotEndInstant', () => {
  it('adds the doctor’s slot length to the clinic-local start', () => {
    // 10:00 AM IST on 4 Aug = 04:30 UTC. +30 min → 05:00 UTC.
    expect(slotEndInstant({ appointmentDate: day('2026-08-04'), appointmentTime: '10:00 AM' }, 30)).toEqual(
      new Date('2026-08-04T05:00:00.000Z')
    );
  });

  it('honours a longer consultation', () => {
    expect(slotEndInstant({ appointmentDate: day('2026-08-04'), appointmentTime: '10:00 AM' }, 45)).toEqual(
      new Date('2026-08-04T05:15:00.000Z')
    );
  });

  it('converts PM times correctly', () => {
    // 2:30 PM IST = 09:00 UTC. +30 → 09:30 UTC.
    expect(slotEndInstant({ appointmentDate: day('2026-08-04'), appointmentTime: '2:30 PM' }, 30)).toEqual(
      new Date('2026-08-04T09:30:00.000Z')
    );
  });

  it('rolls an early-morning slot back into the PREVIOUS UTC day', () => {
    // 5:00 AM IST is 23:30 UTC the day before — the sweep compares against a UTC
    // `now`, so a naive same-day assumption would treat this as hours away.
    expect(slotEndInstant({ appointmentDate: day('2026-08-04'), appointmentTime: '5:00 AM' }, 30)).toEqual(
      new Date('2026-08-04T00:00:00.000Z')
    );
  });

  it('handles a late slot that ends after midnight IST', () => {
    // 11:45 PM IST = 18:15 UTC. +30 → 18:45 UTC (still the same UTC day).
    expect(slotEndInstant({ appointmentDate: day('2026-08-04'), appointmentTime: '11:45 PM' }, 30)).toEqual(
      new Date('2026-08-04T18:45:00.000Z')
    );
  });

  it('treats midnight (12:00 AM) as the start of the day, not noon', () => {
    // 12:00 AM IST = 18:30 UTC the previous day.
    expect(slotEndInstant({ appointmentDate: day('2026-08-04'), appointmentTime: '12:00 AM' }, 30)).toEqual(
      new Date('2026-08-03T19:00:00.000Z')
    );
  });

  it('treats noon (12:00 PM) as midday', () => {
    // 12:00 PM IST = 06:30 UTC.
    expect(slotEndInstant({ appointmentDate: day('2026-08-04'), appointmentTime: '12:00 PM' }, 30)).toEqual(
      new Date('2026-08-04T07:00:00.000Z')
    );
  });

  it('a slot that has not ended sorts after now; one that has, before it', () => {
    const appt = { appointmentDate: day('2026-08-04'), appointmentTime: '10:00 AM' };
    const end = slotEndInstant(appt, 30); // 05:00 UTC
    expect(end > new Date('2026-08-04T04:45:00.000Z')).toBe(true); // mid-consultation
    expect(end <= new Date('2026-08-04T05:00:00.000Z')).toBe(true); // exactly at the end → done
  });
});

// The no-show half of the sweep. Same pure helper, called with the slot length
// PLUS a grace period, so the two decisions differ only by that offset.
describe('no-show grace', () => {
  const GRACE = 30;

  it('waits a further 30 minutes after the slot ends before calling it a miss', () => {
    const appt = { appointmentDate: day('2026-08-04'), appointmentTime: '12:00 PM' };
    // 12:00 PM IST = 06:30 UTC. Slot ends 07:00; a miss is only declared at 07:30.
    expect(slotEndInstant(appt, 30)).toEqual(new Date('2026-08-04T07:00:00.000Z'));
    expect(slotEndInstant(appt, 30 + GRACE)).toEqual(new Date('2026-08-04T07:30:00.000Z'));
  });

  it('leaves a window in which the visit is over but no message has gone out', () => {
    // The point of the grace: a doctor who has finished but not yet saved the
    // note must not have their patient texted "your appointment has passed".
    const appt = { appointmentDate: day('2026-08-04'), appointmentTime: '12:00 PM' };
    const justAfterTheSlot = new Date('2026-08-04T07:15:00.000Z');
    expect(slotEndInstant(appt, 30) <= justAfterTheSlot).toBe(true); // eligible to complete
    expect(slotEndInstant(appt, 30 + GRACE) > justAfterTheSlot).toBe(true); // not yet a no-show
  });

  it('scales with the doctor’s own slot length, not a fixed hour', () => {
    // A 15-minute consultation is a no-show 45 minutes in, not 60.
    const appt = { appointmentDate: day('2026-08-04'), appointmentTime: '12:00 PM' };
    expect(slotEndInstant(appt, 15 + GRACE)).toEqual(new Date('2026-08-04T07:15:00.000Z'));
  });
});
