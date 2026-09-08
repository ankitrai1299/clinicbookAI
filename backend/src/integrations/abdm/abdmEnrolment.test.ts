import { describe, it, expect } from 'vitest';

import { asAppError, toPem } from './abdmEnrolment.service';

/** The shape axios hands us. */
const failure = (status: number, data: unknown) => ({ response: { status, data } });

describe('asAppError', () => {
  it('reads the nested error a wrong OTP produces', () => {
    // The one error a desk hits routinely, and the only one they can fix by
    // retyping — so it must survive intact rather than becoming "request failed".
    const e = asAppError(
      failure(422, { error: { code: 'ABDM-1204', message: 'UIDAI Error code : 400 : Invalid Aadhaar OTP value.' } }),
      'fallback'
    );
    expect(e.message).toBe('UIDAI Error code : 400 : Invalid Aadhaar OTP value.');
    expect(e.statusCode).toBe(422);
  });

  it('reads field-level validation', () => {
    const e = asAppError(failure(400, { loginId: 'Invalid LoginId', timestamp: '2026-09-08 10:47:02' }), 'fallback');
    expect(e.message).toBe('Invalid LoginId');
  });

  it('does not read an HTML page one character at a time', () => {
    // ABDM answers with an HTML error page when its own gateway is unwell.
    // `Object.entries` on a string yields one entry PER CHARACTER, and joining
    // those put "<; !; D; O; C; T; Y; P; E; ..." in front of a clinic — a real
    // incident, and the reason this case exists.
    const html = '<!DOCTYPE HTML PUBLIC "-//IETF//DTD HTML 2.0//EN"><html><head><title>500</title></head></html>';
    const e = asAppError(failure(502, html), 'fallback');

    expect(e.message).not.toContain('; ');
    expect(e.message).toContain('502');
    expect(e.message.length).toBeLessThan(160);
    expect(e.statusCode).toBe(502);
  });

  it('survives a body that is not there at all', () => {
    // A timeout or a refused connection has no response, so there is nothing to
    // read; the caller's own wording is better than anything invented here.
    expect(asAppError(new Error('socket hang up'), 'Could not send the OTP.').message).toBe(
      'ABDM could not be reached. Try again in a minute.'
    );
    expect(asAppError(failure(500, null), 'Could not send the OTP.').message).toContain('500');
  });

  it('passes an AppError through untouched', () => {
    const original = asAppError(failure(400, { message: 'An Aadhaar number is 12 digits.' }), 'fallback');
    expect(asAppError(original, 'fallback')).toBe(original);
  });
});

describe('toPem', () => {
  it('wraps and line-wraps what ABDM returns', () => {
    // ABDM sends bare base64 on one line; node's RSA refuses it in that form.
    const pem = toPem('A'.repeat(200));
    expect(pem.startsWith('-----BEGIN PUBLIC KEY-----\n')).toBe(true);
    expect(pem.endsWith('\n-----END PUBLIC KEY-----')).toBe(true);
    const body = pem.split('\n').slice(1, -1);
    expect(body.every((l) => l.length <= 64)).toBe(true);
    expect(body.join('')).toBe('A'.repeat(200));
  });
});
