import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getWhatsAppWebhookVerifyToken, isWhatsAppConfigured } from '../../config/whatsapp.js';
import {
  exampleSendMessageFunction,
  recordInboundMessage,
  recordStatusUpdate,
  sendWhatsAppTextMessage
} from './whatsapp.service.js';
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

  // Persist webhook side-effects. Wrapped so a DB hiccup never makes us return
  // non-200 — Meta retries on any non-200 and would replay the whole batch.
  let statusesPersisted = 0;
  try {
    // Inbound messages (re)open the 24h session window for that number.
    await Promise.all(
      incomingMessages
        .filter((m) => m.from)
        .map((m) => recordInboundMessage(m.from as string, m.timestamp))
    );

    // Delivery receipts advance the matching outbound log's status.
    const counts = await Promise.all(
      incomingStatuses
        .filter((s) => s.id && s.status)
        .map((s) => recordStatusUpdate(s.id as string, s.status as string))
    );
    statusesPersisted = counts.reduce((sum, c) => sum + c, 0);
  } catch (err) {
    console.error('[WhatsApp] Failed to persist webhook payload:', err);
  }

  console.info('WhatsApp webhook received', {
    configured: isWhatsAppConfigured(),
    incomingMessages,
    incomingStatuses,
    statusesPersisted
  });

  res.status(200).json({
    success: true,
    message: 'Webhook received',
    data: {
      messages: incomingMessages.length,
      statuses: incomingStatuses.length,
      statusesPersisted
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