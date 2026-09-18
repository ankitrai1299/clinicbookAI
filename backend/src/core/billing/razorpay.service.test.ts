import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';

const env: Record<string, string | undefined> = {};
vi.mock('../../config/env.js', () => ({ env: new Proxy({}, { get: (_t, k: string) => env[k] }) }));

const findFirst = vi.fn();
const findUnique = vi.fn();
const update = vi.fn();
vi.mock('../../config/prisma.js', () => ({
  prisma: {
    clinic: {
      findFirst: (...a: unknown[]) => findFirst(...(a as [])),
      findUnique: (...a: unknown[]) => findUnique(...(a as [])),
      update: (...a: unknown[]) => update(...(a as [])),
    },
  },
}));

const { handleRazorpayWebhook } = await import('./razorpay.service.js');

const SECRET = 'whsec';
const send = (event: string, entity: Record<string, unknown> = {}) => {
  const body = Buffer.from(JSON.stringify({ event, payload: { subscription: { entity } } }));
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  return handleRazorpayWebhook(body, sig);
};
const planWritten = () => update.mock.calls[0]?.[0]?.data?.plan;

// What a payment event does to a clinic's access.
//
// Two ways to be wrong and they are not equal. Granting access to someone who
// has not paid costs a month's fee. REMOVING access from a clinic that has paid
// takes down their WhatsApp booking mid-morning, loses them patients, and is
// found out by an angry phone call rather than a report.
describe('subscription events', () => {
  beforeEach(() => {
    env.RAZORPAY_WEBHOOK_SECRET = SECRET;
    findFirst.mockReset().mockResolvedValue({ id: 'clinic-1' });
    findUnique.mockReset().mockResolvedValue({ id: 'clinic-1' });
    update.mockReset().mockResolvedValue({});
  });

  it('turns the clinic on when the subscription activates', async () => {
    await send('subscription.activated', { id: 'sub_1', notes: { clinicId: 'clinic-1' } });
    expect(planWritten()).toBe('GROWTH');
  });

  it('keeps it on when a renewal is charged', async () => {
    await send('subscription.charged', { id: 'sub_1' });
    expect(planWritten()).toBe('GROWTH');
  });

  it('does NOT cut a clinic off on one failed auto-debit', async () => {
    // "pending" is Razorpay starting its retries — usually a mandate that
    // bounced because the account was short for a day. A clinic whose booking
    // dies that morning loses patients over a bank's timing, and the recovery
    // costs more than the month being argued about. "halted" is where it stops.
    await send('subscription.pending', { id: 'sub_1' });
    expect(update).not.toHaveBeenCalled();
  });

  it('cuts access when Razorpay gives up retrying', async () => {
    await send('subscription.halted', { id: 'sub_1' });
    expect(planWritten()).toBe('STARTER');
  });

  it('cuts access when the clinic cancels', async () => {
    await send('subscription.cancelled', { id: 'sub_1' });
    expect(planWritten()).toBe('STARTER');
  });

  it('does nothing at all for an event it does not know', async () => {
    await send('payment.failed', { id: 'sub_1' });
    expect(update).not.toHaveBeenCalled();
  });
});

describe('what it refuses', () => {
  beforeEach(() => {
    env.RAZORPAY_WEBHOOK_SECRET = SECRET;
    findFirst.mockReset().mockResolvedValue({ id: 'clinic-1' });
    findUnique.mockReset().mockResolvedValue({ id: 'clinic-1' });
    update.mockReset().mockResolvedValue({});
  });

  it('writes nothing when the signature is forged', async () => {
    const body = Buffer.from(JSON.stringify({ event: 'subscription.activated', payload: { subscription: { entity: { id: 's' } } } }));
    await expect(handleRazorpayWebhook(body, 'forged')).rejects.toThrow(/signature/i);
    expect(update).not.toHaveBeenCalled();
  });

  it('writes nothing when no clinic matches', async () => {
    // A real event for a subscription we have no record of. Silence beats
    // guessing at which clinic it might have meant.
    findFirst.mockResolvedValue(null);
    findUnique.mockResolvedValue(null);
    await send('subscription.activated', { id: 'sub_unknown' });
    expect(update).not.toHaveBeenCalled();
  });

  it('finds the clinic by OUR stored id, not by a note it was handed', async () => {
    // Both come from the signed payload, so neither is attacker-controlled —
    // but the id we wrote ourselves is the stronger of the two, so it is tried
    // first and the note is only a fallback.
    await send('subscription.activated', { id: 'sub_1', notes: { clinicId: 'some-other-clinic' } });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { razorpaySubscriptionId: 'sub_1' } }),
    );
    expect(update.mock.calls[0][0].where).toEqual({ id: 'clinic-1' });
  });
});
