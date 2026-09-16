import { describe, it, expect, vi, beforeEach } from 'vitest';

const clinicCreate = vi.fn();
const clinicFindUnique = vi.fn();
const userCreate = vi.fn();
const userFindUnique = vi.fn();

vi.mock('../../config/prisma.js', () => ({
  prisma: {
    clinic: {
      findUnique: (...a: unknown[]) => clinicFindUnique(...(a as [])),
    },
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...(a as [])),
    },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        clinic: { create: (...a: unknown[]) => clinicCreate(...(a as [])) },
        user: { create: (...a: unknown[]) => userCreate(...(a as [])) },
      }),
  },
}));

// The signup ends by emailing a verification code, which is its own service
// with its own tables. Not what this file is about.
const issueOtp = vi.fn();
vi.mock('../auth/otp.service.js', () => ({ issueOtp: (...a: unknown[]) => issueOtp(...(a as [])) }));

const { registerClinic } = await import('./clinic.service.js');

// What a clinic gets the moment it signs up.
//
// The column's default grants BOTH products, which is right for the clinics
// already in the database and wrong for a stranger from the internet:
// अन्वयScribe is not for sale yet, and a clinic handed it anyway meets a
// product still being tested, decides the whole thing is unreliable, and never
// comes back. There is no second chance at a first impression, so this is
// pinned rather than left to a default nobody re-reads.
describe('a public signup', () => {
  beforeEach(() => {
    clinicCreate.mockReset().mockResolvedValue({ id: 'c1', name: 'Test Clinic', email: 'a@b.com' });
    userCreate.mockReset().mockResolvedValue({ id: 'u1', email: 'a@b.com' });
    clinicFindUnique.mockReset().mockResolvedValue(null);
    userFindUnique.mockReset().mockResolvedValue(null);
    issueOtp.mockReset().mockResolvedValue(undefined);
  });

  const signup = () =>
    registerClinic({
      clinicName: 'Test Clinic',
      ownerName: 'Dr Test',
      email: 'A@B.com',
      phone: '9876543210',
      password: 'secret123',
    } as Parameters<typeof registerClinic>[0]);

  it('gets अन्वयBook and NOT the scribe', async () => {
    await signup();
    expect(clinicCreate.mock.calls[0][0].data.products).toEqual(['clinicbook']);
  });

  it('never silently falls back to the column default', async () => {
    // The default is ["clinicbook","mediscribe"]. Omitting the field here would
    // look like no decision and behave like the wrong one.
    await signup();
    expect(clinicCreate.mock.calls[0][0].data).toHaveProperty('products');
  });

  it('refuses an email that already belongs to someone', async () => {
    clinicFindUnique.mockResolvedValue({ id: 'existing' });
    await expect(signup()).rejects.toThrow(/already exists/i);
    expect(clinicCreate).not.toHaveBeenCalled();
  });
});
