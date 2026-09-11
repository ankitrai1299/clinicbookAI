import { describe, it, expect } from 'vitest';

import { accessTokenExpiry, tokenHoursFor } from './jwt';

// NDHM Secure Application Development Reference Document, §3.1.2 Requirement 2:
//
//   "The default token lifetime for application administrative users must not
//    exceed 12 hours, and for general users, must not exceed 30 hours."
//
// These are NHA's numbers, not a preference, and an ABDM security audit reads
// them straight off that document. This file is what keeps somebody from
// quietly raising them again.

describe('tokenHoursFor', () => {
  it('gives an administrator the shorter life', () => {
    for (const role of ['superadmin', 'hospital_admin', 'admin', 'CLINIC_ADMIN']) {
      expect(tokenHoursFor(role), role).toBe(12);
    }
  });

  it('gives everyone else thirty hours', () => {
    for (const role of ['doctor', 'staff', 'receptionist', '', null, undefined]) {
      expect(tokenHoursFor(role), String(role)).toBe(30);
    }
  });

  it('treats an unrecognised role as a general user, not an admin', () => {
    // The safe direction: a role nobody has mapped yet gets the ordinary limit
    // rather than being silently handed the shorter-but-privileged one, and
    // more importantly is never given LONGER than 30 hours.
    expect(tokenHoursFor('something_new')).toBe(30);
  });
});

describe('accessTokenExpiry', () => {
  it('caps the seven days we were actually issuing', () => {
    // The bug this was written for: JWT_EXPIRES_IN=7d for everybody, which is
    // 168 hours — fourteen times the administrative limit.
    expect(accessTokenExpiry('hospital_admin', '7d')).toBe('12h');
    expect(accessTokenExpiry('doctor', '7d')).toBe('30h');
  });

  it('honours a configured value only when it is SHORTER', () => {
    // An environment variable may tighten a session. It may not loosen one,
    // because the ceiling belongs to a document somebody else wrote.
    expect(accessTokenExpiry('hospital_admin', '4h')).toBe('4h');
    expect(accessTokenExpiry('doctor', '8h')).toBe('8h');
    expect(accessTokenExpiry('doctor', '1d')).toBe('24h');
    expect(accessTokenExpiry('hospital_admin', '1d')).toBe('12h');
  });

  it('falls back to the cap when the value makes no sense', () => {
    for (const bad of ['', 'forever', '30m', '0d', undefined, null]) {
      expect(accessTokenExpiry('doctor', bad as string), String(bad)).toBe('30h');
    }
  });

  it('never returns longer than the role allows', () => {
    const hours = (v: string) => Number(v.replace('h', ''));
    for (const role of ['hospital_admin', 'doctor', 'staff', 'unknown']) {
      for (const configured of ['7d', '365d', '99h', '1h']) {
        expect(hours(accessTokenExpiry(role, configured)), `${role} / ${configured}`).toBeLessThanOrEqual(
          tokenHoursFor(role)
        );
      }
    }
  });
});
