import { Router } from 'express';

import { validate } from '../../middleware/validate.js';
import { exampleSendMessage, handleIncomingWebhook, sendMessageHandler, verifyWebhook } from './whatsapp.controller.js';
import { sendWhatsAppTextSchema } from './whatsapp.validation.js';

const whatsappRouter = Router();

whatsappRouter.get('/webhook', verifyWebhook);
whatsappRouter.post('/webhook', handleIncomingWebhook);
whatsappRouter.post('/send', validate(sendWhatsAppTextSchema), sendMessageHandler);
whatsappRouter.get('/example-send-message', exampleSendMessage);

export default whatsappRouter;