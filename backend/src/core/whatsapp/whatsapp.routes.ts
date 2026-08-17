import { Router } from 'express';

import { requirePermission } from '../authz/requirePermission.js';
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
  getTemplatesHandler,
  onboardChannelHandler,
  provisionTemplatesHandler,
  registerNumberHandler,
  syncTemplatesHandler
} from './whatsapp.onboarding.controller.js';
import { verifyWhatsAppSignature } from './whatsapp.signature.js';
import {
  embeddedSignupSchema,
  onboardWhatsAppChannelSchema,
  sendWhatsAppTemplateSchema,
  sendWhatsAppTextSchema
} from './whatsapp.validation.js';

// Connecting, disconnecting or re-registering the clinic's WhatsApp number is an
// owner action — it decides where every patient message goes. Sending a message
// to a patient is front-desk work, so it rides on being allowed to see them.
const manageChannel = requirePermission('whatsapp.manage');
const messagePatient = requirePermission('patient.read');

const whatsappRouter = Router();

// Public webhook (Meta calls these). GET = verification handshake (VERIFY_TOKEN);
// POST = inbound messages, HMAC-verified against the Meta app secret.
whatsappRouter.get('/webhook', verifyWebhook);
whatsappRouter.post('/webhook', verifyWhatsAppSignature, handleIncomingWebhook);

// --- WhatsApp channel onboarding (STAFF-only, bound to the caller's clinic) ---
// PRIMARY: Meta Embedded Signup (one-click). The front-end gets the public app
// config, launches the popup, then posts the OAuth code + session info here.
whatsappRouter.get('/embedded-signup/config', requireAuth, manageChannel, embeddedConfigHandler);
whatsappRouter.post('/embedded-signup', requireAuth, manageChannel, validate(embeddedSignupSchema), embeddedSignupHandler);

// Channel status (+ live token health) and disconnect (for reconnect flows).
whatsappRouter.get('/channel', requireAuth, manageChannel, getChannelHandler);
whatsappRouter.delete('/channel', requireAuth, manageChannel, disconnectChannelHandler);

// FALLBACK / admin: manual onboarding by pasting Cloud API creds.
whatsappRouter.post('/channel', requireAuth, manageChannel, validate(onboardWhatsAppChannelSchema), onboardChannelHandler);

// Cloud API number activation — retry when Embedded Signup's attempt was blocked
// (e.g. the number still needed verification in Meta WhatsApp Manager).
whatsappRouter.post('/channel/register', requireAuth, manageChannel, registerNumberHandler);

// Per-clinic message templates: approval readiness, refresh from Meta, resubmit.
whatsappRouter.get('/templates', requireAuth, manageChannel, getTemplatesHandler);
whatsappRouter.post('/templates/sync', requireAuth, manageChannel, syncTemplatesHandler);
whatsappRouter.post('/templates/provision', requireAuth, manageChannel, provisionTemplatesHandler);

// Diagnostics — STAFF-only (exposes last inbound phone/message = patient PII).
whatsappRouter.get('/debug', requireAuth, manageChannel, webhookDebugHandler);

// Outbound send endpoints are STAFF-only — never public (they send from the
// clinic's verified WhatsApp number and cost money).
whatsappRouter.post('/send', requireAuth, messagePatient, validate(sendWhatsAppTextSchema), sendMessageHandler);
whatsappRouter.post('/send-template', requireAuth, messagePatient, validate(sendWhatsAppTemplateSchema), sendTemplateHandler);
whatsappRouter.get('/example-send-message', requireAuth, messagePatient, exampleSendMessage);

export default whatsappRouter;