import { describe, it, expect } from 'vitest';
import { AppointmentStatus } from '@prisma/client';

import { isValidTransition } from './appointment.service';

// The appointment lifecycle guard. These matter more than most tests here,
// because the sweep now writes NO_SHOW on its own — from an inference that can
// be wrong — and the wrong answer would otherwise be permanent.
describe('appointment transitions', () => {
  const S = AppointmentStatus;

  describe('NO_SHOW can be taken back', () => {
    // A no-show is inferred from a MISSING scribe note. A doctor who saw the
    // patient on paper leaves exactly the same gap, so some auto-marks will be
    // wrong. If the desk could not correct them, the clinic's no-show numbers
    // would drift permanently away from what actually happened.
    it('→ COMPLETED, for a visit that did happen', () => {
      expect(isValidTransition(S.NO_SHOW, S.COMPLETED)).toBe(true);
    });

    it('→ CONFIRMED, for one marked before the patient walked in late', () => {
      expect(isValidTransition(S.NO_SHOW, S.CONFIRMED)).toBe(true);
    });
  });

  describe('the genuinely terminal states stay shut', () => {
    // Unlike NO_SHOW, these two are asserted by a person, not guessed. Reopening
    // a completed visit would re-fire the thank-you and prescription hand-off.
    it('COMPLETED goes nowhere', () => {
      for (const to of Object.values(S)) {
        if (to === S.COMPLETED) continue;
        expect(isValidTransition(S.COMPLETED, to)).toBe(false);
      }
    });

    it('CANCELLED goes nowhere', () => {
      for (const to of Object.values(S)) {
        if (to === S.CANCELLED) continue;
        expect(isValidTransition(S.CANCELLED, to)).toBe(false);
      }
    });
  });

  it('a booking still runs its normal course', () => {
    expect(isValidTransition(S.PENDING, S.CONFIRMED)).toBe(true);
    expect(isValidTransition(S.CONFIRMED, S.COMPLETED)).toBe(true);
    expect(isValidTransition(S.CONFIRMED, S.NO_SHOW)).toBe(true);
    expect(isValidTransition(S.PENDING, S.NO_SHOW)).toBe(true);
  });

  it('a status may always be re-applied to itself', () => {
    // Write paths depend on this: a double-click must be a no-op, not a 409.
    for (const s of Object.values(S)) expect(isValidTransition(s, s)).toBe(true);
  });
});
