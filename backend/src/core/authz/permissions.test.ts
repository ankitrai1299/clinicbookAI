import { describe, it, expect } from 'vitest';

import { PERMISSIONS, ROLE_PERMISSIONS, hasPermission } from './permissions.js';
import { PLATFORM_ROLES, platformRoleOf, asPlatformRole, effectiveRole } from './roles.js';
import { ROLES } from '../../products/mediscribe/contracts/index.js';

// The permission matrix is the whole of authorization. If it is wrong, every
// guard built on it is wrong in the same direction and no route test will catch
// it — so the rules are pinned here directly.

describe('the permission matrix', () => {
  it('gives an absent or unknown role nothing at all', () => {
    // The failure mode this prevents: a token with a role this build has never
    // heard of quietly inheriting an administrator's rights.
    for (const role of [undefined, null, '', 'admin', 'ADMIN', 'root', 'ai', 'system']) {
      expect(hasPermission(role, 'patient.read'), String(role)).toBe(false);
      expect(hasPermission(role, 'patient.delete'), String(role)).toBe(false);
    }
  });

  it('has no role for an AI or any other non-human actor', () => {
    // This is the structural reason an AI cannot approve or send a prescription:
    // there is no role it could act under that holds those permissions.
    expect(Object.keys(ROLE_PERMISSIONS)).toEqual(['superadmin', 'hospital_admin', 'doctor', 'receptionist']);
  });

  it('grants prescription approval and sending to the doctor and the clinic owner only', () => {
    for (const permission of ['prescription.approve', 'prescription.send'] as const) {
      expect(hasPermission('doctor', permission)).toBe(true);
      expect(hasPermission('hospital_admin', permission)).toBe(true);
      expect(hasPermission('superadmin', permission)).toBe(true);
      expect(hasPermission('receptionist', permission)).toBe(false);
    }
  });

  it('keeps the clinical record away from the front desk', () => {
    // A receptionist books visits and keeps contact details current. They do not
    // read consultations, listen to recordings, or read the audit trail.
    for (const permission of [
      'consultation.read',
      'consultation.write',
      'recording.read',
      'recording.delete',
      'prescription.read',
      'audit.read'
    ] as const) {
      expect(hasPermission('receptionist', permission), permission).toBe(false);
    }
  });

  it('does not let a receptionist delete a patient, or manage the tenant', () => {
    for (const permission of [
      'patient.delete',
      'users.manage',
      'clinic.settings.manage',
      'apikey.manage',
      'doctor.manage'
    ] as const) {
      expect(hasPermission('receptionist', permission), permission).toBe(false);
    }
  });

  it('does not let a doctor run the tenant', () => {
    // A doctor owns the clinical record, not the business.
    for (const permission of [
      'users.manage',
      'clinic.settings.manage',
      'apikey.manage',
      'whatsapp.manage',
      'patient.delete',
      'audit.read'
    ] as const) {
      expect(hasPermission('doctor', permission), permission).toBe(false);
    }
  });

  it('lets a receptionist do the front-desk job unchanged', () => {
    // The other half of the risk: an RBAC layer that quietly breaks the people
    // who actually use the product all day.
    for (const permission of [
      'patient.read',
      'patient.create',
      'patient.update',
      'appointment.read',
      'appointment.create',
      'appointment.update',
      'appointment.cancel',
      'doctor.read'
    ] as const) {
      expect(hasPermission('receptionist', permission), permission).toBe(true);
    }
  });

  it('leaves every existing account with exactly what it has today', () => {
    // signupUser never sets a role and User.role defaults to CLINIC_ADMIN, so
    // every account this system has created maps to hospital_admin. If that role
    // is anything less than the full set, turning enforcement on is a breaking
    // change for every live clinic — which is the thing this phase must not do.
    const owner = platformRoleOf('CLINIC_ADMIN');
    expect(owner).toBe('hospital_admin');
    for (const permission of PERMISSIONS) {
      expect(hasPermission(owner, permission), permission).toBe(true);
    }
  });

  it('names every permission it grants', () => {
    // A typo in a role's list would silently grant nothing.
    const known = new Set<string>(PERMISSIONS);
    for (const [role, granted] of Object.entries(ROLE_PERMISSIONS)) {
      const unknown = granted.filter((p) => !known.has(p));
      expect(unknown, `${role} grants permissions that do not exist`).toEqual([]);
    }
  });
});

describe('one role vocabulary, not two', () => {
  it('uses the same role names the scribe clients already read', () => {
    // Both scribe clients ship a verbatim copy of contracts.ts. If core invented
    // its own spelling, a role would mean one thing to the server and another to
    // the UI that gates on it.
    expect([...PLATFORM_ROLES].sort()).toEqual([...ROLES].sort());
  });

  it('maps ClinicBook roles into that vocabulary', () => {
    expect(platformRoleOf('ADMIN')).toBe('superadmin');
    expect(platformRoleOf('CLINIC_ADMIN')).toBe('hospital_admin');
    expect(platformRoleOf('STAFF')).toBe('receptionist');
  });

  it('returns null rather than a default for a role it does not know', () => {
    // Authorization must fail closed. The display mapping in nativeAppCompat
    // supplies its own fallback for the app's menu; that is not this.
    expect(platformRoleOf('SOMETHING_NEW')).toBeNull();
    expect(platformRoleOf('')).toBeNull();
    expect(platformRoleOf(undefined)).toBeNull();
    expect(asPlatformRole('wizard')).toBeNull();
  });

  it("prefers MediScribe's stored role, which is the only place a doctor exists", () => {
    // A doctor logs in with a ClinicBook account whose enum has no DOCTOR value.
    // Without this preference every doctor would authorize as a clinic owner.
    expect(effectiveRole({ storedRole: 'doctor', clinicBookRole: 'CLINIC_ADMIN' })).toBe('doctor');
    expect(effectiveRole({ storedRole: undefined, clinicBookRole: 'CLINIC_ADMIN' })).toBe('hospital_admin');
    expect(effectiveRole({ storedRole: 'nonsense', clinicBookRole: 'STAFF' })).toBe('receptionist');
    expect(effectiveRole({ storedRole: undefined, clinicBookRole: undefined })).toBeNull();
  });
});
