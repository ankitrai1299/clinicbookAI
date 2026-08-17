import { describe, it, expect } from 'vitest';

import {
  base32Encode,
  base32Decode,
  generateTotpSecret,
  hotp,
  totp,
  verifyTotp,
  totpUri,
  TOTP_PERIOD
} from './totp.js';

// This is our own implementation of a standard, sitting in the authentication
// path. The only thing that makes that defensible is that the RFCs publish test
// vectors and they are checked here — an authenticator app accepting one code by
// chance would prove nothing.

describe('RFC 4226 — HOTP test vectors', () => {
  // Appendix D. Secret is the ASCII "12345678901234567890".
  const SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'));
  const EXPECTED = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];

  it('matches all ten published counters', () => {
    EXPECTED.forEach((code, counter) => {
      expect(hotp(SECRET, counter), `counter ${counter}`).toBe(code);
    });
  });
});

describe('RFC 6238 — TOTP test vectors', () => {
  // Appendix B, SHA-1 rows. The RFC prints 8 digits; ours are the last 6.
  const SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'));
  const VECTORS: Array<[number, string]> = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130']
  ];

  it('matches every published time step', () => {
    for (const [seconds, eightDigits] of VECTORS) {
      expect(totp(SECRET, seconds * 1000), `t=${seconds}`).toBe(eightDigits.slice(-6));
    }
  });
});

describe('base32', () => {
  it('round-trips', () => {
    for (const text of ['', 'a', 'ab', 'abc', 'abcd', 'abcde', 'hello world', '12345678901234567890']) {
      expect(base32Decode(base32Encode(Buffer.from(text))).toString()).toBe(text);
    }
  });

  it('matches the RFC 4648 vectors', () => {
    expect(base32Encode(Buffer.from('f'))).toBe('MY');
    expect(base32Encode(Buffer.from('fo'))).toBe('MZXQ');
    expect(base32Encode(Buffer.from('foo'))).toBe('MZXW6');
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
  });

  it('refuses a malformed secret instead of decoding it to nonsense', () => {
    // A silently-wrong decode produces codes that never match, and no way to
    // tell that from a user typing the wrong number.
    expect(() => base32Decode('MZXW6!!!')).toThrow(/Invalid base32/);
  });

  it('tolerates padding and whitespace, which is how people paste secrets', () => {
    expect(base32Decode('MZXW6YTBOI').toString()).toBe('foobar');
    expect(base32Decode('MZXW 6YTB OI').toString()).toBe('foobar');
    expect(base32Decode('MZXW6YTBOI======').toString()).toBe('foobar');
  });
});

describe('verification', () => {
  const secret = generateTotpSecret();
  const now = 1_700_000_000_000;

  it('accepts the current code', () => {
    expect(verifyTotp(secret, totp(secret, now), { atMs: now })).toBe(true);
  });

  it('accepts one step of clock drift either way', () => {
    // Phone clocks drift and people take a few seconds to type. Rejecting these
    // would produce a stream of "MFA is broken" reports from honest users.
    const step = TOTP_PERIOD * 1000;
    expect(verifyTotp(secret, totp(secret, now - step), { atMs: now })).toBe(true);
    expect(verifyTotp(secret, totp(secret, now + step), { atMs: now })).toBe(true);
  });

  it('rejects two steps away', () => {
    const step = TOTP_PERIOD * 1000;
    expect(verifyTotp(secret, totp(secret, now - 2 * step), { atMs: now })).toBe(false);
    expect(verifyTotp(secret, totp(secret, now + 2 * step), { atMs: now })).toBe(false);
  });

  it('rejects a wrong code, a short code, and an empty one', () => {
    expect(verifyTotp(secret, '000000', { atMs: now })).toBe(totp(secret, now) === '000000');
    expect(verifyTotp(secret, '12345', { atMs: now })).toBe(false);
    expect(verifyTotp(secret, '', { atMs: now })).toBe(false);
    expect(verifyTotp(secret, 'abcdef', { atMs: now })).toBe(false);
  });

  it("rejects another user's code", () => {
    const other = generateTotpSecret();
    expect(verifyTotp(secret, totp(other, now), { atMs: now })).toBe(false);
  });

  it('generates a different secret every time', () => {
    const secrets = new Set(Array.from({ length: 20 }, () => generateTotpSecret()));
    expect(secrets.size).toBe(20);
  });
});

describe('the enrolment URI', () => {
  it('carries everything an authenticator needs', () => {
    const uri = totpUri({ secret: 'ABCDEFGH', account: 'doctor@clinic.in' });
    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    expect(uri).toContain('secret=ABCDEFGH');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
    // The heading a doctor sees among their other apps.
    expect(decodeURIComponent(uri)).toContain('ClinicBook AI:doctor@clinic.in');
  });
});
