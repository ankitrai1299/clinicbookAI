import { Request, Response } from 'express';

import { asyncHandler } from '../../utils/asyncHandler.js';
import { EmbeddedSignupBody, OnboardWhatsAppChannelInput } from './whatsapp.validation.js';
import {
  disconnectClinicChannel,
  getClinicChannelStatus,
  onboardWhatsAppChannel
} from './whatsapp.onboarding.js';
import { completeEmbeddedSignup, getEmbeddedConfig } from './whatsapp.embeddedSignup.js';

const getClinicId = (req: Request) => req.user!.clinicId;

// POST /api/whatsapp/channel — manual onboarding (paste creds). Kept as a
// fallback / admin path; Embedded Signup is the primary one-click flow below.
export const onboardChannelHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await onboardWhatsAppChannel(getClinicId(req), req.body as OnboardWhatsAppChannelInput);
  res.status(201).json({ success: true, data: result });
});

// GET /api/whatsapp/channel — current clinic's channel + live token health
// (token never returned). Drives the dashboard "Connected / needs reconnect" UI.
export const getChannelHandler = asyncHandler(async (req: Request, res: Response) => {
  const status = await getClinicChannelStatus(getClinicId(req));
  res.status(200).json({ success: true, data: status });
});

// DELETE /api/whatsapp/channel — disconnect (e.g. before reconnecting).
export const disconnectChannelHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await disconnectClinicChannel(getClinicId(req));
  res.status(200).json({ success: true, data: result });
});

// GET /api/whatsapp/embedded-signup/config — public (non-secret) Meta app config
// the front-end SDK needs to launch the Embedded Signup popup.
export const embeddedConfigHandler = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json({ success: true, data: getEmbeddedConfig() });
});

// POST /api/whatsapp/embedded-signup — the one-click flow: exchange the OAuth
// code, resolve business/WABA/phone, subscribe webhook, encrypt + store token,
// bind the channel to THIS clinic.
export const embeddedSignupHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await completeEmbeddedSignup(getClinicId(req), req.body as EmbeddedSignupBody);
  res.status(201).json({ success: true, data: result });
});
