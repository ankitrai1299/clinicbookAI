import { describe, it, expect } from 'vitest';

import {
  PLATFORM_ROLES,
  platformRoleOf,
  clinicBookRoleOf,
  effectiveRole,
  type PlatformRole
} from './roles.js';

// The two directions of the role mapping used to be written separately — one as
// a switch here, the other as a ternary chain inlined at two call sites. Both
// ternaries ended `: UserRole.STAFF`, so 'doctor' — which neither branch named —
// silently became front-desk staff. A doctor was then stored as a receptionist,
// which is why they could sign into ClinicBook and land on a desk dashboard.
//
// These tests exist to make that specific failure impossible to reintroduce.

describe('the two directions agree', () => {
  it('round-trips every platform role', () => {
    // This is the real guard. If someone adds a fifth role and teaches only one
    // direction about it, the other direction sends it somewhere wrong — and
    // "somewhere wrong" for a role mapping means someone gets the wrong access.
    for (const role of PLATFORM_ROLES) {
      expect(platformRoleOf(clinicBookRoleOf(role)), role).toBe(role);
    }
  });

  it('covers every platform role in the forward direction', () => {
    const reachable = new Set(
      (['ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'STAFF'] as const).map(platformRoleOf)
    );
    for (const role of PLATFORM_ROLES) {
      expect(reachable.has(role), `no UserRole maps to '${role}'`).toBe(true);
    }
  });

  it('never maps two platform roles onto one stored role', () => {
    // Two roles sharing a stored value means the round trip cannot distinguish
    // them, and one of the two would quietly become the other on the way back.
    const stored = PLATFORM_ROLES.map(clinicBookRoleOf);
    expect(new Set(stored).size).toBe(PLATFORM_ROLES.length);
  });
});

describe('a doctor is a doctor', () => {
  it('reads DOCTOR as doctor, not as staff', () => {
    expect(platformRoleOf('DOCTOR')).toBe('doctor');
    expect(clinicBookRoleOf('doctor')).toBe('DOCTOR');
  });

  it('does not read STAFF as doctor', () => {
    // The old workaround. A doctor stored as STAFF is a doctor the system thinks
    // is a receptionist — the whole bug in one line.
    expect(platformRoleOf('STAFF')).toBe('receptionist');
  });

  it('accepts the spelling however it is cased', () => {
    expect(platformRoleOf('doctor')).toBe('doctor');
    expect(platformRoleOf('Doctor')).toBe('doctor');
  });
});

describe('authorization fails closed', () => {
  it('gives an unrecognised role NO role rather than a default one', () => {
    // Not 'receptionist', not 'hospital_admin' — null. A token carrying a value
    // this build has never heard of must inherit nobody's permissions.
    expect(platformRoleOf('WIZARD')).toBeNull();
    expect(platformRoleOf(undefined)).toBeNull();
    expect(platformRoleOf('')).toBeNull();
  });

  it('prefers the more specific stored role when both are present', () => {
    expect(effectiveRole({ storedRole: 'doctor', clinicBookRole: 'STAFF' })).toBe('doctor');
  });

  it('falls back to the token role when nothing is stored', () => {
    expect(effectiveRole({ clinicBookRole: 'DOCTOR' })).toBe('doctor');
  });

  it('is null when neither side says anything we know', () => {
    expect(effectiveRole({ storedRole: 'nonsense', clinicBookRole: 'nonsense' })).toBeNull();
  });
});

describe('the enum in the database and this file cannot drift', () => {
  it('maps exactly the values the schema declares', async () => {
    // If someone adds a UserRole to schema.prisma and not here, platformRoleOf
    // returns null for it and that account silently has no permissions at all.
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const schema = fs.readFileSync(path.resolve(dir, '../../../prisma/schema.prisma'), 'utf8');

    const block = schema.match(/enum UserRole \{([\s\S]*?)\n\}/);
    expect(block, 'UserRole enum not found in schema.prisma').toBeTruthy();

    const values = block![1]
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('//'));

    const unmapped = values.filter((v) => platformRoleOf(v) === null);
    expect(
      unmapped,
      'These UserRole values map to no platform role, so accounts holding them ' +
        'would have no permissions:\n  ' + unmapped.join('\n  ')
    ).toEqual([]);

    // And the reverse: nothing here may claim a value the database cannot store.
    for (const role of PLATFORM_ROLES as readonly PlatformRole[]) {
      expect(values, `clinicBookRoleOf('${role}') is not a real UserRole`).toContain(
        clinicBookRoleOf(role)
      );
    }
  });
});
