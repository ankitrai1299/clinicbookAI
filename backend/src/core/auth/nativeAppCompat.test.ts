import { describe, it, expect } from 'vitest';

import { toNativeAppUser, toScribeRole, withNativeAppAuth } from './nativeAppCompat.js';
import { mapClinicBookRole } from '../../products/mediscribe/services/auth.js';

// The native MediScribe app is reproduced from its reference and must not be
// edited, so the server carries the difference between what it reads and what
// the web reads. Both shapes travel in one response — which only works for as
// long as adding the app's fields never disturbs the web's.

const user = {
  id: 'u1',
  clinicId: 'c1',
  name: 'Dr Ankit',
  email: 'doctor@example.com',
  role: 'STAFF'
};

describe('auth response for the native app', () => {
  it('puts the token and user where the app looks for them', () => {
    // The app stores `res.token` straight into AsyncStorage. When that was
    // undefined it threw before login could complete — the failure this exists
    // to prevent.
    const body = withNativeAppAuth(
      { success: true, message: 'Login successful', data: { user, accessToken: 'jwt-abc' } },
      { user, accessToken: 'jwt-abc' }
    );
    expect(body.token).toBe('jwt-abc');
    expect(body.user.email).toBe('doctor@example.com');
  });

  it('leaves the web envelope exactly as it was', () => {
    // The dashboard reads data.accessToken and data.user. If either moved or
    // changed shape, every browser login would break at once.
    const original = { success: true, message: 'Login successful', data: { user, accessToken: 'jwt-abc' } };
    const body = withNativeAppAuth(original, { user, accessToken: 'jwt-abc' });
    expect(body.success).toBe(true);
    expect(body.message).toBe('Login successful');
    expect(body.data).toEqual({ user, accessToken: 'jwt-abc' });
  });

  it('translates the role into the vocabulary the app understands', () => {
    // ClinicBook says STAFF / CLINIC_ADMIN / ADMIN; the app says receptionist /
    // hospital_admin / superadmin. Sending ours verbatim would leave the app
    // with a role it cannot match, and it decides what to show from this.
    expect(toNativeAppUser({ ...user, role: 'STAFF' }).role).toBe('receptionist');
    expect(toNativeAppUser({ ...user, role: 'CLINIC_ADMIN' }).role).toBe('hospital_admin');
    expect(toNativeAppUser({ ...user, role: 'ADMIN' }).role).toBe('superadmin');
  });

  it("agrees with the product's own role mapping", () => {
    // The map is duplicated in core because core may not import a product. That
    // is only safe while the two answers stay identical — a doctor who reads as
    // a receptionist in one place and an admin in the other is the failure.
    for (const role of ['ADMIN', 'CLINIC_ADMIN', 'STAFF', '', 'SOMETHING_NEW']) {
      expect(toScribeRole(role), role).toBe(mapClinicBookRole(role));
    }
  });

  it('reports the clinic as the hospital the app expects', () => {
    expect(toNativeAppUser(user).hospitalId).toBe('c1');
  });

  it('never returns an undefined token or id', () => {
    // AsyncStorage rejects undefined outright, so an absent value is not a blank
    // screen — it is a crash on the login button.
    const body = withNativeAppAuth({ data: {} }, { user, accessToken: 'jwt-abc' });
    expect(body.token).toBeTypeOf('string');
    expect(body.user.id).toBeTypeOf('string');
  });
});
