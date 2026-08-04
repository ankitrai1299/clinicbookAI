import { describe, it, expect } from 'vitest';

// The PURE rule deciding WHICH appointment a finalized consultation closes.
// Getting this wrong sends a "thank you for visiting" WhatsApp for a visit that
// has not happened, so the refusal-to-guess behaviour is the point of the test.
import { pickAppointmentToComplete } from './appointmentCompletion';

const appt = (id: string) => ({ id });

describe('pickAppointmentToComplete', () => {
  it('closes the single live appointment of the day', () => {
    expect(pickAppointmentToComplete([appt('a1')])).toEqual(appt('a1'));
  });

  it('closes nothing when the patient has no live appointment', () => {
    expect(pickAppointmentToComplete([])).toBeNull();
  });

  it('refuses to guess between two live appointments the same day', () => {
    // Completing the wrong one would thank the patient for a visit still ahead
    // of them. Leave both for staff instead.
    expect(pickAppointmentToComplete([appt('a1'), appt('a2')])).toBeNull();
  });

  it('uses the explicit appointment id when the session came from Today’s Queue', () => {
    // The ambiguity above disappears the moment we know which visit was opened.
    expect(pickAppointmentToComplete([appt('a1'), appt('a2')], 'a2')).toEqual(appt('a2'));
  });

  it('closes nothing when the explicit id is not among the live appointments', () => {
    // e.g. staff already cancelled or completed it while the doctor was writing.
    expect(pickAppointmentToComplete([appt('a1')], 'gone')).toBeNull();
  });

  it('never falls back to the single candidate when an explicit id misses', () => {
    // A stale id must not silently close whatever else is open that day.
    expect(pickAppointmentToComplete([appt('other')], 'a1')).toBeNull();
  });
});
