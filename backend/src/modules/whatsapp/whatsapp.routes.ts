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
import { verifyWhatsAppSignature } from './whatsapp.signature.js';
import { sendWhatsAppTemplateSchema, sendWhatsAppTextSchema } from './whatsapp.validation.js';

const whatsappRouter = Router();

// Public webhook (Meta calls these). GET = verification handshake (VERIFY_TOKEN);
// POST = inbound messages, HMAC-verified against the Meta app secret.
whatsappRouter.get('/webhook', verifyWebhook);
whatsappRouter.post('/webhook', verifyWhatsAppSignature, handleIncomingWebhook);

// Diagnostics — STAFF-only (exposes last inbound phone/message = patient PII).
whatsappRouter.get('/debug', requireAuth, webhookDebugHandler);

// Outbound send endpoints are STAFF-only — never public (they send from the
// clinic's verified WhatsApp number and cost money).
whatsappRouter.post('/send', requireAuth, validate(sendWhatsAppTextSchema), sendMessageHandler);
whatsappRouter.post('/send-template', requireAuth, validate(sendWhatsAppTemplateSchema), sendTemplateHandler);
whatsappRouter.get('/example-send-message', requireAuth, exampleSendMessage);

export default whatsappRouter;