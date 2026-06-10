import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getWhatsAppWebhookVerifyToken, isWhatsAppConfigured } from '../../config/whatsapp.js';
import { exampleSendMessageFunction, sendWhatsAppTextMessage } from './whatsapp.service.js';
import { IncomingWhatsAppWebhook, WhatsAppTextMessageInput } from './whatsapp.types.js';

export const verifyWebhook = (req: Request, res: Response) => {
  const mode = String(req.query['hub.mode'] ?? '');
  const token = String(req.query['hub.verify_token'] ?? '');
  const challenge = String(req.query['hub.challenge'] ?? '');

  if (mode === 'subscribe' && token && token === getWhatsAppWebhookVerifyToken()) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
};

export const handleIncomingWebhook = asyncHandler(async (req: Request, res: Response) => {
  const payload = req.body as IncomingWhatsAppWebhook;

  const incomingMessages =
    payload.entry?.flatMap((entry) =>
      entry.changes?.flatMap((change) =>
        change.value?.messages?.map((message) => ({
          from: message.from,
          messageId: message.id,
          type: message.type,
          text: message.text?.body,
          timestamp: message.timestamp
        })) ?? []
      ) ?? []
    ) ?? [];

  const incomingStatuses =
    payload.entry?.flatMap((entry) =>
      entry.changes?.flatMap((change) =>
        change.value?.statuses?.map((status) => ({
          id: status.id,
          status: status.status,
          recipientId: status.recipient_id,
          timestamp: status.timestamp
        })) ?? []
      ) ?? []
    ) ?? [];

  console.info('WhatsApp webhook received', {
    configured: isWhatsAppConfigured(),
    incomingMessages,
    incomingStatuses
  });

  res.status(200).json({
    success: true,
    message: 'Webhook received',
    data: {
      messages: incomingMessages.length,
      statuses: incomingStatuses.length
    }
  });
});

export const sendMessageHandler = asyncHandler(async (req: Request, res: Response) => {
  const payload = req.body as WhatsAppTextMessageInput;

  if (!payload?.to || !payload?.body) {
    throw new AppError('Both to and body are required', 400);
  }

  const response = await sendWhatsAppTextMessage(payload);

  res.status(200).json({
    success: true,
    message: 'Message sent successfully',
    data: response.data
  });
});

export const exampleSendMessage = asyncHandler(async (_req: Request, res: Response) => {
  const response = await exampleSendMessageFunction();

  res.status(200).json({
    success: true,
    message: 'Example send message executed successfully',
    data: response.data
  });
});