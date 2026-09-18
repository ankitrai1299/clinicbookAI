// How an Indian clinic pays.
//
// ── Why this exists next to the Stripe file ───────────────────────────────
//
// Stripe does not onboard new Indian businesses. The Stripe code beside this
// one is complete, tested and has never taken a rupee, because it cannot — the
// account can never be opened. It stays for a company that later sells outside
// India; everything a clinic in India pays goes through here.
//
// ── Written against the REST API, not the SDK ─────────────────────────────
//
// Two calls and one signature check. The SDK would add a dependency whose
// release cadence we would then be tied to, in exchange for wrapping a POST.
//
// ── Where the money actually gets decided ─────────────────────────────────
//
// The amount, the interval and the currency live in a Plan in the Razorpay
// dashboard, not in this file. Pricing changes without a deploy, and a price
// compiled into the backend is a price nobody can correct at 9pm on a Sunday.

import crypto from 'crypto';

import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';

const API = 'https://api.razorpay.com/v1';

/**
 * Free days before the first rupee is charged.
 *
 * Razorpay has no "trial" field — a trial IS a subscription whose first charge
 * is dated in the future. The mandate is authorised on day one (the clinic
 * approves the UPI AutoPay or card), and `start_at` decides when money first
 * moves. So the clinic is set up, fully working, and not paying.
 *
 * Fourteen, because a clinic needs to see a real week of its own patients
 * booking before it can judge this, and a week that happens to be quiet would
 * decide it for them.
 */
export const TRIAL_DAYS = 14;

export const isRazorpayConfigured = (): boolean =>
  Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAY_PLAN_ID);

const auth = (): string => {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new AppError('Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.', 503);
  }
  return Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth()}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const body = await res.text();
  if (!res.ok) {
    // Razorpay's own message, not ours. "Payment failed" tells a clinic owner
    // nothing; "International cards are not supported" tells them what to do.
    let detail = body.slice(0, 300);
    try {
      detail = JSON.parse(body)?.error?.description ?? detail;
    } catch {
      /* not JSON — the raw body is still the most useful thing we have */
    }
    throw new AppError(`Razorpay: ${detail}`, res.status === 401 ? 503 : 502);
  }
  return JSON.parse(body) as T;
}

export interface RazorpaySubscription {
  id: string;
  status: string;
  short_url: string;
  customer_id?: string;
}

/**
 * Start a subscription and return the page the clinic pays on.
 *
 * The clinic id goes into `notes`, which Razorpay echoes back on every webhook
 * for this subscription. That is what ties a payment to a clinic, and it is
 * deliberately not the only link — the subscription id is stored on the clinic
 * too, so a webhook can be matched even if the notes are ever lost, and so the
 * question "what is this clinic paying?" can be answered without calling
 * Razorpay.
 */
export const createSubscription = async (clinic: {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
}): Promise<RazorpaySubscription> => {
  if (!env.RAZORPAY_PLAN_ID) {
    throw new AppError('Razorpay plan is not configured. Add RAZORPAY_PLAN_ID.', 503);
  }

  return call<RazorpaySubscription>('/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      plan_id: env.RAZORPAY_PLAN_ID,
      // 12 months, then it ends rather than renewing silently forever. A clinic
      // that stops using this should reach a decision point, not a standing
      // debit nobody remembers agreeing to.
      total_count: 12,
      customer_notify: 1,
      // The trial. Nothing is charged until this date; the mandate is approved
      // now so that the fifteenth day needs no action from a clinic that has
      // decided to stay.
      start_at: Math.floor(Date.now() / 1000) + TRIAL_DAYS * 24 * 60 * 60,
      notes: { clinicId: clinic.id, clinicName: clinic.name, trialDays: String(TRIAL_DAYS) },
    }),
  });
};

/** Stop a subscription at the end of the paid period, not mid-month. */
export const cancelSubscription = async (subscriptionId: string): Promise<void> => {
  await call(`/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
    method: 'POST',
    // The clinic paid for this month. Cutting them off the moment they cancel
    // takes money for a service and then withdraws it.
    body: JSON.stringify({ cancel_at_cycle_end: 1 }),
  });
};

/**
 * Is this webhook really from Razorpay?
 *
 * Everything downstream of this marks a clinic as paid, so a forged request
 * that got past here would be a free subscription for anyone who can find the
 * URL. Two details carry that weight:
 *
 *   • the RAW request bytes are hashed, not a re-serialised object — JSON.parse
 *     followed by JSON.stringify can reorder keys and change whitespace, and
 *     the hash of that is not the hash Razorpay computed;
 *
 *   • the comparison is timing-safe. A byte-by-byte `===` returns faster the
 *     sooner it finds a difference, and a patient attacker can read a secret
 *     out of that difference one character at a time.
 */
export const verifyWebhookSignature = (rawBody: Buffer, signature: string): boolean => {
  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    throw new AppError('Razorpay webhook secret is not configured.', 503);
  }
  if (!signature) return false;

  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  // timingSafeEqual throws on a length mismatch, which is itself a fast answer.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};
