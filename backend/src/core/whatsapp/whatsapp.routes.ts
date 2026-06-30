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
import {
  disconnectChannelHandler,
  embeddedConfigHandler,
  embeddedSignupHandler,
  getChannelHandler,
  onboardChannelHandler
} from './whatsapp.onboarding.controller.js';
import { verifyWhatsAppSignature } from './whatsapp.signature.js';
import {
  embeddedSignupSchema,
  onboardWhatsAppChannelSchema,
  sendWhatsAppTemplateSchema,
  sendWhatsAppTextSchema
} from './whatsapp.validation.js';

const whatsappRouter = Router();

// Public webhook (Meta calls these). GET = verification handshake (VERIFY_TOKEN);
// POST = inbound messages, HMAC-verified against the Meta app secret.
whatsappRouter.get('/webhook', verifyWebhook);
whatsappRouter.post('/webhook', verifyWhatsAppSignature, handleIncomingWebhook);

// --- WhatsApp channel onboarding (STAFF-only, bound to the caller's clinic) ---
// PRIMARY: Meta Embedded Signup (one-click). The front-end gets the public app
// config, launches the popup, then posts the OAuth code + session info here.
whatsappRouter.get('/embedded-signup/config', requireAuth, embeddedConfigHandler);
whatsappRouter.post('/embedded-signup', requireAuth, validate(embeddedSignupSchema), embeddedSignupHandler);

// Channel status (+ live token health) and disconnect (for reconnect flows).
whatsappRouter.get('/channel', requireAuth, getChannelHandler);
whatsappRouter.delete('/channel', requireAuth, disconnectChannelHandler);

// FALLBACK / admin: manual onboarding by pasting Cloud API creds.
whatsappRouter.post('/channel', requireAuth, validate(onboardWhatsAppChannelSchema), onboardChannelHandler);

// Diagnostics — STAFF-only (exposes last inbound phone/message = patient PII).
whatsappRouter.get('/debug', requireAuth, webhookDebugHandler);

// Outbound send endpoints are STAFF-only — never public (they send from the
// clinic's verified WhatsApp number and cost money).
whatsappRouter.post('/send', requireAuth, validate(sendWhatsAppTextSchema), sendMessageHandler);
whatsappRouter.post('/send-template', requireAuth, validate(sendWhatsAppTemplateSchema), sendTemplateHandler);
whatsappRouter.get('/example-send-message', requireAuth, exampleSendMessage);

export default whatsappRouter;