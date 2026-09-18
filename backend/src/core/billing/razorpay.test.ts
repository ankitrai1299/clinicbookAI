import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';

const env: Record<string, string | undefined> = {};
vi.mock('../../config/env.js', () => ({ env: new Proxy({}, { get: (_t, k: string) => env[k] }) }));

const { verifyWebhookSignature, isRazorpayConfigured } = await import('./razorpay.js');

const SECRET = 'whsec_test_secret';
const sign = (body: Buffer, secret = SECRET) =>
  crypto.createHmac('sha256', secret).update(body).digest('hex');

// The gate in front of the money.
//
// Everything past this point marks a clinic as paid. A forged request that got
// through would be a free subscription for anyone who can find the URL, so the
// tests here are about what must be REFUSED.
describe('webhook signature', () => {
  beforeEach(() => {
    env.RAZORPAY_WEBHOOK_SECRET = SECRET;
    env.RAZORPAY_KEY_ID = 'rzp_test_x';
    env.RAZORPAY_KEY_SECRET = 'secret';
    env.RAZORPAY_PLAN_ID = 'plan_x';
  });

  it('accepts a genuine signature', () => {
    const body = Buffer.from('{"event":"subscription.activated"}');
    expect(verifyWebhookSignature(body, sign(body))).toBe(true);
  });

  it('refuses a signature made with the wrong secret', () => {
    const body = Buffer.from('{"event":"subscription.activated"}');
    expect(verifyWebhookSignature(body, sign(body, 'not-our-secret'))).toBe(false);
  });

  it('refuses a body that was altered after signing', () => {
    // The whole attack: take a real webhook, change whose clinic it is.
    const real = Buffer.from('{"clinicId":"attacker"}');
    const signature = sign(real);
    expect(verifyWebhookSignature(Buffer.from('{"clinicId":"victim"}'), signature)).toBe(false);
  });

  it('refuses an empty or missing signature', () => {
    const body = Buffer.from('{}');
    expect(verifyWebhookSignature(body, '')).toBe(false);
    expect(verifyWebhookSignature(body, undefined as unknown as string)).toBe(false);
  });

  it('refuses a signature of the wrong length without throwing', () => {
    // timingSafeEqual throws on a length mismatch. An exception here would be a
    // 500 on every malformed request instead of a clean refusal.
    const body = Buffer.from('{}');
    expect(() => verifyWebhookSignature(body, 'abc')).not.toThrow();
    expect(verifyWebhookSignature(body, 'abc')).toBe(false);
  });

  it('hashes the RAW bytes, so re-serialising would break it', () => {
    // A handler that parsed the JSON and re-stringified it would compute a
    // different hash — same data, different bytes — and every genuine webhook
    // would be refused.
    const raw = Buffer.from('{"b":1,  "a":2}');
    const signature = sign(raw);
    const reserialised = Buffer.from(JSON.stringify(JSON.parse(raw.toString())));
    expect(verifyWebhookSignature(raw, signature)).toBe(true);
    expect(verifyWebhookSignature(reserialised, signature)).toBe(false);
  });

  it('refuses to guess when no secret is configured', () => {
    // Returning false would look like a rejected forgery; throwing says the
    // server is misconfigured, which is a different problem with a different fix.
    delete env.RAZORPAY_WEBHOOK_SECRET;
    expect(() => verifyWebhookSignature(Buffer.from('{}'), 'x')).toThrow(/webhook secret/i);
  });
});

describe('configuration', () => {
  it('is not configured until the key, the secret AND the plan are set', () => {
    env.RAZORPAY_KEY_ID = 'rzp_test_x';
    env.RAZORPAY_KEY_SECRET = 'secret';
    env.RAZORPAY_PLAN_ID = 'plan_x';
    expect(isRazorpayConfigured()).toBe(true);

    // A key with no plan takes payments against nothing.
    delete env.RAZORPAY_PLAN_ID;
    expect(isRazorpayConfigured()).toBe(false);
  });
});
