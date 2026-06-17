import Stripe from 'stripe';
import { ClinicPlan } from '@prisma/client';

import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';

const getStripe = (): Stripe => {
  if (!env.STRIPE_SECRET_KEY) throw new AppError('Stripe is not configured', 503);
  return new Stripe(env.STRIPE_SECRET_KEY);
};

export const isStripeConfigured = (): boolean =>
  Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_ID);

export const createCheckoutSession = async (
  clinicId: string,
  successUrl: string,
  cancelUrl: string
): Promise<{ url: string }> => {
  const stripe = getStripe();
  if (!env.STRIPE_PRICE_ID) throw new AppError('Stripe price not configured', 503);

  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { id: true, name: true, email: true, stripeCustomerId: true, plan: true },
  });
  if (!clinic) throw new AppError('Clinic not found', 404);
  if (clinic.plan !== ClinicPlan.STARTER) throw new AppError('Clinic already has an active subscription', 409);

  let customerId = clinic.stripeCustomerId ?? undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: clinic.name,
      email: clinic.email,
      metadata: { clinicId },
    });
    customerId = customer.id;
    await prisma.clinic.update({
      where: { id: clinicId },
      data: { stripeCustomerId: customerId },
    });
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: env.STRIPE_PRICE_ID, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { clinicId },
  });

  if (!session.url) throw new AppError('Failed to create checkout session', 500);
  return { url: session.url };
};

export const createPortalSession = async (
  clinicId: string,
  returnUrl: string
): Promise<{ url: string }> => {
  const stripe = getStripe();

  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { stripeCustomerId: true },
  });
  if (!clinic?.stripeCustomerId) throw new AppError('No active billing subscription found', 404);

  const session = await stripe.billingPortal.sessions.create({
    customer: clinic.stripeCustomerId,
    return_url: returnUrl,
  });

  return { url: session.url };
};

const STRIPE_STATUS_TO_PLAN: Record<string, ClinicPlan> = {
  active: ClinicPlan.GROWTH,
  trialing: ClinicPlan.GROWTH,
  past_due: ClinicPlan.STARTER,
  canceled: ClinicPlan.STARTER,
  unpaid: ClinicPlan.STARTER,
  incomplete: ClinicPlan.STARTER,
  incomplete_expired: ClinicPlan.STARTER,
  paused: ClinicPlan.STARTER,
};

export const handleStripeWebhook = async (payload: Buffer, signature: string): Promise<void> => {
  const stripe = getStripe();
  if (!env.STRIPE_WEBHOOK_SECRET) throw new AppError('Stripe webhook secret not configured', 503);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    throw new AppError('Invalid webhook signature', 400);
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const clinicId = session.metadata?.clinicId;
      if (clinicId && session.customer) {
        await prisma.clinic.update({
          where: { id: clinicId },
          data: {
            stripeCustomerId: String(session.customer),
            plan: ClinicPlan.GROWTH,
          },
        });
      }
      break;
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const clinic = await prisma.clinic.findFirst({
        where: { stripeCustomerId: String(subscription.customer) },
        select: { id: true },
      });
      if (clinic) {
        const newPlan = STRIPE_STATUS_TO_PLAN[subscription.status] ?? ClinicPlan.STARTER;
        await prisma.clinic.update({
          where: { id: clinic.id },
          data: { plan: newPlan },
        });
      }
      break;
    }
  }
};
