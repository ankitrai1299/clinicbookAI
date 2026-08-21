import { describe, it, expect } from 'vitest';

import { SURFACES, SURFACE_ACCESS, maySignInTo, wrongSurfaceMessage } from './surfaces.js';
import { PLATFORM_ROLES } from './roles.js';

// The clinic's rule, written down:
//
//   ClinicBook  →  admins and the front desk
//   MediScribe  →  admins and doctors
//   patients    →  neither; they are on WhatsApp and have no account at all
//
// A doctor could previously sign into ClinicBook because the role enum had no
// DOCTOR and they were stored as STAFF.

describe('who signs in where', () => {
  it('keeps a doctor out of ClinicBook', () => {
    expect(maySignInTo('doctor', 'clinicbook')).toBe(false);
  });

  it('lets a doctor into MediScribe', () => {
    expect(maySignInTo('doctor', 'mediscribe')).toBe(true);
  });

  it('lets an admin into both', () => {
    for (const surface of SURFACES) {
      expect(maySignInTo('hospital_admin', surface), surface).toBe(true);
      expect(maySignInTo('superadmin', surface), surface).toBe(true);
    }
  });

  it('keeps the front desk in ClinicBook', () => {
    expect(maySignInTo('receptionist', 'clinicbook')).toBe(true);
    expect(maySignInTo('receptionist', 'mediscribe')).toBe(false);
  });
});

describe('it fails closed', () => {
  it('refuses a role this build does not recognise', () => {
    // platformRoleOf returns null for an unknown role. That must not become a
    // way in — an unrecognised role signs in nowhere.
    for (const surface of SURFACES) {
      expect(maySignInTo(null, surface), surface).toBe(false);
    }
  });

  it('gives every known role at least one surface', () => {
    // The other failure direction: a role that can sign in NOWHERE is an account
    // nobody can use, and the person holding it gets no explanation.
    for (const role of PLATFORM_ROLES) {
      expect(SURFACE_ACCESS[role].length, `${role} can sign in nowhere`).toBeGreaterThan(0);
    }
  });

  it('names every role in the table', () => {
    // A new role added without touching this table would have no entry, and
    // SURFACE_ACCESS[role] would be undefined — which throws rather than denies.
    for (const role of PLATFORM_ROLES) {
      expect(SURFACE_ACCESS[role], `${role} missing from SURFACE_ACCESS`).toBeDefined();
    }
  });

  it('lists only real surfaces', () => {
    for (const role of PLATFORM_ROLES) {
      for (const s of SURFACE_ACCESS[role]) {
        expect(SURFACES, `${role} points at '${s}'`).toContain(s);
      }
    }
  });
});

describe('what the person is told', () => {
  it('sends a doctor to MediScribe by name', () => {
    const msg = wrongSurfaceMessage('doctor', 'clinicbook');
    expect(msg).toContain('MediScribe');
    expect(msg).toContain('Doctors');
  });

  it('never says the password was wrong', () => {
    // They typed it correctly. Someone told their password is wrong will try it
    // again, then reset it, then call the clinic — and none of that helps.
    for (const role of PLATFORM_ROLES) {
      for (const surface of SURFACES) {
        if (maySignInTo(role, surface)) continue;
        const msg = wrongSurfaceMessage(role, surface).toLowerCase();
        expect(msg, `${role} @ ${surface}`).not.toContain('password');
        expect(msg, `${role} @ ${surface}`).not.toContain('invalid');
      }
    }
  });

  it('never tells someone to go where they also cannot go', () => {
    for (const role of PLATFORM_ROLES) {
      for (const surface of SURFACES) {
        if (maySignInTo(role, surface)) continue;
        const msg = wrongSurfaceMessage(role, surface);
        // The attempted surface is named on purpose — "…, not ClinicBook" tells
        // the person which door they are standing at. Only the OTHER names in
        // the sentence are directions, and those are what must be honest.
        const named = SURFACES.filter(
          (s) => s !== surface && msg.includes(s === 'mediscribe' ? 'MediScribe' : 'ClinicBook')
        );
        for (const s of named) {
          expect(maySignInTo(role, s), `${role} was sent to ${s}, which also refuses them`).toBe(true);
        }
      }
    }
  });
});
