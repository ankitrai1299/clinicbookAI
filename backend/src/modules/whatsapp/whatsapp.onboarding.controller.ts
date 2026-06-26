import { Request, Response } from 'express';

import { asyncHandler } from '../../utils/asyncHandler.js';
import { OnboardWhatsAppChannelInput } from './whatsapp.validation.js';
import { getClinicChannel, onboardWhatsAppChannel } from './whatsapp.onboarding.js';

const getClinicId = (req: Request) => req.user!.clinicId;

// POST /api/whatsapp/channel — onboard (or update) the current clinic's WhatsApp
// channel: validate creds + webhook with Meta, encrypt the token, persist.
export const onboardChannelHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await onboardWhatsAppChannel(getClinicId(req), req.body as OnboardWhatsAppChannelInput);
  res.status(201).json({ success: true, data: result });
});

// GET /api/whatsapp/channel — the current clinic's channel (token never returned).
export const getChannelHandler = asyncHandler(async (req: Request, res: Response) => {
  const channel = await getClinicChannel(getClinicId(req));
  res.status(200).json({ success: true, data: channel });
});
