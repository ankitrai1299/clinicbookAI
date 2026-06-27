import { describe, it, expect } from 'vitest';

// Pure OTP helpers — no DB (import without a .js extension so Vite resolves the
// .ts source).
import { checkOtp, generateOtp, hashOtp, MAX_ATTEMPTS, OTP_TTL_MS } from './otp.service';

const future = (ms = 5 * 60 * 1000) => new Date(Date.now() + ms);
const past = (ms = 1000) => new Date(Date.now() - ms);

describe('otp.service — pure helpers', () => {
  it('generates a 6-digit numeric code (zero-padded)', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateOtp();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it('hashes deterministically and differs from the plaintext', () => {
    expect(hashOtp('123456')).toBe(hashOtp('123456'));
    expect(hashOtp('123456')).not.toBe('123456');
    expect(hashOtp('123456')).not.toBe(hashOtp('123457'));
  });

  describe('checkOtp', () => {
    const code = '123456';
    const good = { codeHash: hashOtp(code), expiresAt: future(), attempts: 0 };

    it('accepts the correct unexpired code', () => {
      expect(checkOtp(good, code)).toBeNull();
    });

    it('rejects when there is no record', () => {
      expect(checkOtp(null, code)).toBe('no-code');
    });

    it('rejects an expired code', () => {
      expect(checkOtp({ ...good, expiresAt: past() }, code)).toBe('expired');
    });

    it('rejects after the attempt cap', () => {
      expect(checkOtp({ ...good, attempts: MAX_ATTEMPTS }, code)).toBe('too-many');
    });

    it('rejects a wrong code', () => {
      expect(checkOtp(good, '000000')).toBe('mismatch');
    });

    it('checks the attempt cap before expiry (cap wins)', () => {
      expect(checkOtp({ ...good, attempts: MAX_ATTEMPTS, expiresAt: past() }, code)).toBe('too-many');
    });

    it('respects the TTL constant (a code just within TTL is valid)', () => {
      const justInside = { codeHash: hashOtp(code), expiresAt: future(OTP_TTL_MS - 1000), attempts: 0 };
      expect(checkOtp(justInside, code)).toBeNull();
    });
  });
});
