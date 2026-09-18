import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  createCheckoutSession,
  createPortalSession,
  handleStripeWebhook,
  isStripeConfigured,
} from './billing.service.js';
import { isRazorpayConfigured } from './razorpay.js';
import { startSubscription, stopSubscription, handleRazorpayWebhook } from './razorpay.service.js';

export const getStripeStatusHandler = asyncHandler(async (_req: Request, res: Response) => {
  // Which way a clinic can pay, so the UI offers the one that works rather than
  // a button that fails on click.
  res.status(200).json({
    success: true,
    data: {
      configured: isStripeConfigured() || isRazorpayConfigured(),
      razorpay: isRazorpayConfigured(),
      stripe: isStripeConfigured(),
    },
  });
});

export const startSubscriptionHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await startSubscription(req.user!.clinicId);
  res.status(200).json({ success: true, data: result });
});

export const stopSubscriptionHandler = asyncHandler(async (req: Request, res: Response) => {
  await stopSubscription(req.user!.clinicId);
  res.status(200).json({ success: true });
});

/**
 * Razorpay's webhook.
 *
 * `req.body` is a Buffer here and must stay one — the route mounts
 * express.raw() ahead of the JSON parser. Parsing and re-serialising would
 * change the bytes (key order, whitespace) and every genuine signature would
 * then fail to match.
 *
 * A bad signature answers 400 and nothing is written. A GENUINE event that
 * fails while being applied must answer 500, not 400: Razorpay retries a 5xx
 * and gives up on a 4xx, and a clinic that paid would otherwise stay locked out
 * because a database hiccup was reported as "your request was malformed".
 */
export const razorpayWebhookHandler = async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers['x-razorpay-signature'];
  if (!signature || typeof signature !== 'string') {
    res.status(400).json({ success: false, message: 'Missing x-razorpay-signature header' });
    return;
  }
  try {
    await handleRazorpayWebhook(req.body as Buffer, signature);
    res.status(200).json({ success: true });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : 'Webhook error';
    const status = err?.statusCode ?? err?.status;
    const clientFault = status === 400 || status === 503;
    if (!clientFault) console.error('[razorpay:webhook] failed to apply a verified event:', message);
    res.status(clientFault ? Number(status) : 500).json({ success: false, message });
  }
};

export const createCheckoutSessionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { successUrl, cancelUrl } = req.body as { successUrl?: string; cancelUrl?: string };
  if (!successUrl || !cancelUrl) throw new AppError('successUrl and cancelUrl are required', 400);
  const result = await createCheckoutSession(req.user!.clinicId, successUrl, cancelUrl);
  res.status(200).json({ success: true, data: result });
});

export const createPortalSessionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { returnUrl } = req.body as { returnUrl?: string };
  if (!returnUrl) throw new AppError('returnUrl is required', 400);
  const result = await createPortalSession(req.user!.clinicId, returnUrl);
  res.status(200).json({ success: true, data: result });
});

export const stripeWebhookHandler = async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers['stripe-signature'];
  if (!signature || typeof signature !== 'string') {
    res.status(400).json({ success: false, message: 'Missing stripe-signature header' });
    return;
  }
  try {
    await handleStripeWebhook(req.body as Buffer, signature);
    res.status(200).json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook error';
    res.status(400).json({ success: false, message });
  }
};
