import { describe, it, expect, vi, beforeEach } from 'vitest';

// The doctor could sign in at the ClinicBook door and land on a front-desk
// dashboard. These tests drive the REAL loginUser — not a copy of the rule —
// because the rule being right in surfaces.ts is worth nothing if login never
// asks it.

type Row = {
  id: string;
  clinicId: string;
  name: string;
  email: string;
  role: string;
  passwordHash: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
};

let row: Row | null = null;

vi.mock('../../config/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: async () => row,
      update: async () => row
    }
  }
}));

// A device credential is a separate path with its own tests; keep it out of the way.
vi.mock('./appPassword.service.js', () => ({ resolveAppPassword: async () => null }));
vi.mock('./otp.service.js', () => ({ issueOtp: async () => undefined, verifyOtp: async () => undefined }));

const bcrypt = (await import('bcryptjs')).default;
const { loginUser } = await import('./auth.service.js');

const PASSWORD = 'correct-horse';

const asRole = async (role: string): Promise<void> => {
  row = {
    id: 'u1',
    clinicId: 'c1',
    name: 'A',
    email: 'a@clinic.test',
    role,
    passwordHash: await bcrypt.hash(PASSWORD, 4),
    emailVerified: true,
    mfaEnabled: false
  };
};

const login = (product?: 'clinicbook' | 'mediscribe') =>
  loginUser({ email: 'a@clinic.test', password: PASSWORD, ...(product ? { product } : {}) } as never);

beforeEach(() => {
  row = null;
});

describe('a doctor at the ClinicBook door', () => {
  it('is refused', async () => {
    await asRole('DOCTOR');
    await expect(login('clinicbook')).rejects.toThrow();
  });

  it('is told to use MediScribe, not that their password is wrong', async () => {
    await asRole('DOCTOR');
    // The whole point. "Invalid email or password" for someone who typed it
    // correctly ends as a password reset that cannot help, then a phone call.
    await expect(login('clinicbook')).rejects.toThrow(/MediScribe/);
  });

  it('is refused with 403, not 401', async () => {
    await asRole('DOCTOR');
    // 401 is the client's "wrong password" branch. The credentials were right.
    const err = await login('clinicbook').catch((e) => e);
    expect(err.statusCode ?? err.status).toBe(403);
  });

  it('signs in fine at the MediScribe door', async () => {
    await asRole('DOCTOR');
    const result = await login('mediscribe');
    expect(result.accessToken).toBeTruthy();
  });
});

describe('everyone else is unaffected', () => {
  it('lets a clinic admin into both', async () => {
    await asRole('CLINIC_ADMIN');
    expect((await login('clinicbook')).accessToken).toBeTruthy();
    expect((await login('mediscribe')).accessToken).toBeTruthy();
  });

  it('lets the front desk into ClinicBook', async () => {
    await asRole('STAFF');
    expect((await login('clinicbook')).accessToken).toBeTruthy();
  });
});

describe('shipped clients keep working', () => {
  it('allows a login that does not say which product it is', async () => {
    // The native MediScribe app posts to this same endpoint and sends no
    // product. If the absent field were treated as a refusal, every installed
    // app would stop signing in on the day this deployed.
    await asRole('DOCTOR');
    expect((await login()).accessToken).toBeTruthy();
    await asRole('CLINIC_ADMIN');
    expect((await login()).accessToken).toBeTruthy();
  });
});

describe('the door is checked after the password, never before', () => {
  it('reports a wrong password as a wrong password, whatever the role', async () => {
    await asRole('DOCTOR');
    // If the surface were checked first, this endpoint would answer "Doctors
    // sign in to MediScribe" to anyone guessing — turning it into a way to find
    // out which addresses belong to doctors.
    const err = await loginUser({
      email: 'a@clinic.test',
      password: 'wrong',
      product: 'clinicbook'
    } as never).catch((e) => e);
    expect(err.message).toMatch(/invalid email or password/i);
  });

  it('says nothing about the surface for an address that does not exist', async () => {
    row = null;
    const err = await login('clinicbook').catch((e) => e);
    expect(err.message).toMatch(/invalid email or password/i);
  });
});
