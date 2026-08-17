// TOTP (RFC 6238) — the second factor, implemented on node:crypto.
//
// Written rather than pulled from npm for two reasons. It is about sixty lines
// of well-specified arithmetic with published test vectors, so correctness is
// PROVABLE here in a way that "the package has a lot of downloads" is not. And a
// dependency that sits in the authentication path is a supply-chain surface on
// the most sensitive code we have — the audit's own C-2 finding is about
// third-party exposure, and this is the cheapest place to have none.
//
// The RFC's SHA-1 test vectors are in the test file. If this file is ever
// changed, those vectors are what say whether it still works — not whether an
// authenticator app happened to accept one code.
//
// PURE except for node:crypto: no database, no env, no express.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Digits in a code. Six is what every authenticator app shows. */
export const TOTP_DIGITS = 6;

/** Seconds per step. Thirty is the universal default; changing it breaks apps. */
export const TOTP_PERIOD = 30;

/**
 * How many steps either side of "now" we accept.
 *
 * One step = ±30 seconds. This exists because the user's phone clock and the
 * server clock drift, and because a person takes a few seconds to type. Zero
 * would reject honest users constantly; a large window would widen the guessing
 * surface for no benefit.
 */
export const TOTP_WINDOW = 1;

// ── base32 (RFC 4648, no padding) — the encoding authenticator apps expect ───

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const base32Encode = (buf: Buffer): string => {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
};

export const base32Decode = (input: string): Buffer => {
  const clean = (input || '').toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = ALPHABET.indexOf(char);
    // A malformed secret must not silently decode to something plausible — that
    // would produce codes that never match, with no explanation.
    if (idx === -1) throw new Error('Invalid base32 character in the TOTP secret');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
};

/** A fresh secret. 20 bytes = 160 bits, the size RFC 4226 specifies for SHA-1. */
export const generateTotpSecret = (): string => base32Encode(randomBytes(20));

// ── The algorithm ───────────────────────────────────────────────────────────

/** HOTP for a counter value (RFC 4226). */
export const hotp = (secretBase32: string, counter: number, digits = TOTP_DIGITS): string => {
  const key = base32Decode(secretBase32);

  // 8-byte big-endian counter. Written with BigInt so it stays correct past
  // 2^32 steps rather than silently truncating.
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac('sha1', key).update(buf).digest();

  // Dynamic truncation, RFC 4226 §5.3.
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 10 ** digits).padStart(digits, '0');
};

/** The code for a moment in time. `atMs` defaults to now. */
export const totp = (secretBase32: string, atMs: number = Date.now(), period = TOTP_PERIOD): string =>
  hotp(secretBase32, Math.floor(atMs / 1000 / period));

/**
 * Is this code valid for this secret, right now?
 *
 * Compared in constant time. A timing-variable compare on a six-digit code is a
 * small leak, but it is a leak in the authentication path and it costs nothing
 * to close.
 */
export const verifyTotp = (
  secretBase32: string,
  code: string,
  opts: { atMs?: number; window?: number; period?: number } = {}
): boolean => {
  const clean = (code || '').replace(/\D/g, '');
  if (clean.length !== TOTP_DIGITS) return false;

  const period = opts.period ?? TOTP_PERIOD;
  const window = opts.window ?? TOTP_WINDOW;
  const counter = Math.floor((opts.atMs ?? Date.now()) / 1000 / period);

  const given = Buffer.from(clean);
  let ok = false;
  for (let drift = -window; drift <= window; drift++) {
    const expected = Buffer.from(hotp(secretBase32, counter + drift));
    // No early exit: checking every step in the window regardless keeps the
    // work constant whether the match is at the start or the end.
    if (expected.length === given.length && timingSafeEqual(expected, given)) ok = true;
  }
  return ok;
};

/**
 * The otpauth:// URI an authenticator app scans.
 *
 * `issuer` appears as the account's heading in the app, so it has to be
 * recognisable — a doctor with three healthcare apps needs to know which code
 * is ours.
 */
export const totpUri = (params: { secret: string; account: string; issuer?: string }): string => {
  const issuer = params.issuer || 'ClinicBook AI';
  const label = encodeURIComponent(`${issuer}:${params.account}`);
  const query = new URLSearchParams({
    secret: params.secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD)
  });
  return `otpauth://totp/${label}?${query.toString()}`;
};
