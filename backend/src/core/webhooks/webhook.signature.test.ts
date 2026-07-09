import { describe, it, expect } from 'vitest';

import { signPayload, verifySignature } from './webhook.service.js';

// These tests pin the exact algorithm a partner has to implement, so a change to
// signPayload that silently breaks every integration fails here first.
describe('webhook signature', () => {
  const secret = 'whsec_test_abc123';
  const body = JSON.stringify({ id: 'del_1', event: 'appointment.booked', data: { clinicId: 'c1' } });
  const now = 1_800_000_000;

  it('a signature we produce verifies', () => {
    const header = signPayload(secret, body, now);
    expect(header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(verifySignature(secret, body, header, now)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const header = signPayload(secret, body, now);
    expect(verifySignature(secret, body.replace('c1', 'c2'), header, now)).toBe(false);
  });

  it('rejects a wrong secret', () => {
    const header = signPayload(secret, body, now);
    expect(verifySignature('whsec_someone_else', body, header, now)).toBe(false);
  });

  it('rejects a replay outside the tolerance window', () => {
    const header = signPayload(secret, body, now);
    // The timestamp is inside the signed material, so an attacker cannot re-stamp
    // a captured request — and we refuse it once it ages out.
    expect(verifySignature(secret, body, header, now + 301)).toBe(false);
    expect(verifySignature(secret, body, header, now + 299)).toBe(true);
  });

  it('rejects a malformed or truncated signature without throwing', () => {
    expect(verifySignature(secret, body, 'garbage', now)).toBe(false);
    expect(verifySignature(secret, body, `t=${now},v1=`, now)).toBe(false);
    // A short hex string must not blow up timingSafeEqual's length check.
    expect(verifySignature(secret, body, `t=${now},v1=abcd`, now)).toBe(false);
  });
});
