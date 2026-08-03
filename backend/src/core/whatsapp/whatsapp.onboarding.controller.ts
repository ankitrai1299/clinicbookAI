import { Request, Response } from 'express';

import { asyncHandler } from '../../utils/asyncHandler.js';
import { EmbeddedSignupBody, OnboardWhatsAppChannelInput } from './whatsapp.validation.js';
import {
  disconnectClinicChannel,
  getClinicChannelStatus,
  onboardWhatsAppChannel
} from './whatsapp.onboarding.js';
import { completeEmbeddedSignup, getEmbeddedConfig } from './whatsapp.embeddedSignup.js';
import {
  getTemplateReadiness,
  refreshClinicTemplates,
  reprovisionClinicTemplates,
  reregisterClinicNumber
} from './whatsapp.provisioning.js';

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

// --- Per-clinic template provisioning -------------------------------------
// A clinic's own WABA starts with zero approved templates, and Meta's review is
// asynchronous. These let the dashboard show progress and recover without
// forcing the clinic to disconnect and reconnect.

// GET /api/whatsapp/templates — approval readiness (DB only, no Graph call).
export const getTemplatesHandler = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({ success: true, data: await getTemplateReadiness(getClinicId(req)) });
});

// POST /api/whatsapp/templates/sync — re-pull Meta's verdicts ("Refresh").
export const syncTemplatesHandler = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({ success: true, data: await refreshClinicTemplates(getClinicId(req)) });
});

// POST /api/whatsapp/templates/provision — resubmit missing/failed templates.
export const provisionTemplatesHandler = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({ success: true, data: await reprovisionClinicTemplates(getClinicId(req)) });
});

// POST /api/whatsapp/channel/register — re-run Cloud API number activation.
// Needed when the first attempt failed because the number was not yet verified
// in Meta WhatsApp Manager; until it succeeds every send fails with 133010.
export const registerNumberHandler = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({ success: true, data: await reregisterClinicNumber(getClinicId(req)) });
});
