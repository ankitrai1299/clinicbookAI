// Turning a Razorpay event into "this clinic has paid".
//
// Raw prisma by design, for the same reason the Stripe service uses it: this
// manages the Clinic ROW, whose tenant key is its own id, and the webhook
// arrives with no JWT and no tenant context at all. Authenticated paths scope
// by `where: { id: clinicId }`; the webhook resolves the clinic from the
// signed payload and never from anything the caller chose.

import { ClinicPlan } from '@prisma/client';

import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { createSubscription, verifyWebhookSignature, cancelSubscription } from './razorpay.js';

/**
 * Start a subscription for a clinic and hand back the page they pay on.
 */
export const startSubscription = async (clinicId: string): Promise<{ url: string }> => {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { id: true, name: true, email: true, phone: true, plan: true, razorpaySubscriptionId: true },
  });
  if (!clinic) throw new AppError('Clinic not found', 404);
  if (clinic.plan !== ClinicPlan.STARTER) {
    throw new AppError('This clinic already has an active subscription', 409);
  }

  const subscription = await createSubscription(clinic);

  // Stored BEFORE the clinic is sent to pay. If it were written after, a clinic
  // that paid while the server restarted would have a live subscription that
  // nothing here knows about — money taken and no record of why.
  await prisma.clinic.update({
    where: { id: clinicId },
    data: {
      razorpaySubscriptionId: subscription.id,
      ...(subscription.customer_id ? { razorpayCustomerId: subscription.customer_id } : {}),
    },
  });

  return { url: subscription.short_url };
};

/** End a subscription at the end of the period the clinic already paid for. */
export const stopSubscription = async (clinicId: string): Promise<void> => {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { razorpaySubscriptionId: true },
  });
  if (!clinic?.razorpaySubscriptionId) throw new AppError('No active subscription found', 404);
  await cancelSubscription(clinic.razorpaySubscriptionId);
};

/**
 * What each event means for a clinic's access.
 *
 * `pending` is the one worth arguing about. Razorpay sends it when a charge
 * fails and the retries begin — a UPI mandate that bounced because the account
 * was short for a day, most often. Access is KEPT through it: a clinic whose
 * WhatsApp booking dies on the morning of a failed auto-debit loses patients
 * over a bank's timing, and the recovery — an angry call, a refund argument —
 * costs more than the month being argued about. `halted` is Razorpay saying the
 * retries are over, and that is where access stops.
 */
const EVENT_TO_PLAN: Record<string, ClinicPlan | null> = {
  'subscription.activated': ClinicPlan.GROWTH,
  'subscription.charged': ClinicPlan.GROWTH,
  'subscription.resumed': ClinicPlan.GROWTH,
  'subscription.authenticated': null, // mandate approved, nothing charged yet
  'subscription.pending': null,       // a charge failed; retries running — keep access
  'subscription.updated': null,
  'subscription.halted': ClinicPlan.STARTER,
  'subscription.cancelled': ClinicPlan.STARTER,
  'subscription.completed': ClinicPlan.STARTER,
  'subscription.expired': ClinicPlan.STARTER,
};

export const handleRazorpayWebhook = async (rawBody: Buffer, signature: string): Promise<void> => {
  if (!verifyWebhookSignature(rawBody, signature)) {
    throw new AppError('Invalid webhook signature', 400);
  }

  let event: any;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw new AppError('Malformed webhook payload', 400);
  }

  const name = String(event?.event ?? '');
  if (!(name in EVENT_TO_PLAN)) return; // an event we do not act on is not an error
  const plan = EVENT_TO_PLAN[name];
  if (plan === null) {
    console.log(`[razorpay] ${name} — noted, access unchanged`);
    return;
  }

  const subscription = event?.payload?.subscription?.entity;
  const subscriptionId = subscription?.id ? String(subscription.id) : null;
  const clinicId = subscription?.notes?.clinicId ? String(subscription.notes.clinicId) : null;

  // The subscription id first, because it is what WE stored; the note second,
  // for a subscription created before that write landed. Both come from the
  // signed payload — nothing here is taken from an unauthenticated caller.
  const clinic =
    (subscriptionId
      ? await prisma.clinic.findFirst({ where: { razorpaySubscriptionId: subscriptionId }, select: { id: true } })
      : null) ??
    (clinicId ? await prisma.clinic.findUnique({ where: { id: clinicId }, select: { id: true } }) : null);

  if (!clinic) {
    console.warn(`[razorpay] ${name} for subscription ${subscriptionId ?? '(none)'} — no matching clinic`);
    return;
  }

  await prisma.clinic.update({
    where: { id: clinic.id },
    data: {
      plan,
      ...(subscriptionId ? { razorpaySubscriptionId: subscriptionId } : {}),
    },
  });
  console.log(`[razorpay] ${name} → clinic ${clinic.id} is now ${plan}`);
};
