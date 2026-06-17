import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  createCheckoutSession,
  createPortalSession,
  handleStripeWebhook,
  isStripeConfigured,
} from './billing.service.js';

export const getStripeStatusHandler = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json({ success: true, data: { configured: isStripeConfigured() } });
});

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
