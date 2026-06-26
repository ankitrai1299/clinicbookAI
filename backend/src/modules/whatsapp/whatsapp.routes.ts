import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  exampleSendMessage,
  handleIncomingWebhook,
  sendMessageHandler,
  sendTemplateHandler,
  verifyWebhook,
  webhookDebugHandler
} from './whatsapp.controller.js';
import { getChannelHandler, onboardChannelHandler } from './whatsapp.onboarding.controller.js';
import { verifyWhatsAppSignature } from './whatsapp.signature.js';
import {
  onboardWhatsAppChannelSchema,
  sendWhatsAppTemplateSchema,
  sendWhatsAppTextSchema
} from './whatsapp.validation.js';

const whatsappRouter = Router();

// Public webhook (Meta calls these). GET = verification handshake (VERIFY_TOKEN);
// POST = inbound messages, HMAC-verified against the Meta app secret.
whatsappRouter.get('/webhook', verifyWebhook);
whatsappRouter.post('/webhook', verifyWhatsAppSignature, handleIncomingWebhook);

// Per-clinic channel onboarding — STAFF-only. POST validates the clinic's own
// WhatsApp Cloud API creds + webhook with Meta, encrypts the token, and binds a
// WhatsAppChannel to the authenticated clinic. GET returns its status (no token).
whatsappRouter.post('/channel', requireAuth, validate(onboardWhatsAppChannelSchema), onboardChannelHandler);
whatsappRouter.get('/channel', requireAuth, getChannelHandler);

// Diagnostics — STAFF-only (exposes last inbound phone/message = patient PII).
whatsappRouter.get('/debug', requireAuth, webhookDebugHandler);

// Outbound send endpoints are STAFF-only — never public (they send from the
// clinic's verified WhatsApp number and cost money).
whatsappRouter.post('/send', requireAuth, validate(sendWhatsAppTextSchema), sendMessageHandler);
whatsappRouter.post('/send-template', requireAuth, validate(sendWhatsAppTemplateSchema), sendTemplateHandler);
whatsappRouter.get('/example-send-message', requireAuth, exampleSendMessage);

export default whatsappRouter;