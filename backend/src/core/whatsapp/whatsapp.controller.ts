import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getWhatsAppWebhookVerifyToken, isWhatsAppConfigured } from '../../config/whatsapp.js';
import {
  exampleSendMessageFunction,
  recordStatusUpdate,
  sendWhatsAppTemplateMessage,
  sendWhatsAppTextMessage
} from './whatsapp.service.js';
import { handleInboundText } from './whatsapp.inbound.js';
import { isVoiceAiEnabledFor, transcribeWhatsAppVoice } from './whatsapp.voice.js';
import { TemplateComponent, WhatsAppTemplateName } from './whatsapp.templates.js';
import { SendWhatsAppTemplateInput } from './whatsapp.validation.js';
import { IncomingWhatsAppWebhook, WhatsAppTextMessageInput } from './whatsapp.types.js';
import { buildDiagnostics, recordInbound, recordWebhookHit, WEBHOOK_PATH } from './whatsapp.diagnostics.js';

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

  // Count every webhook POST (incl. status-only) for GET /api/whatsapp/debug.
  recordWebhookHit();

  // FIRST thing we do on every webhook hit: log the raw arrival. If a patient's
  // message never shows up here, it never reached the backend (Meta didn't
  // deliver it) — this line is the ground truth for "did the inbound arrive?".
  console.info('[WhatsApp][webhook] ▶ POST received', {
    object: payload?.object ?? null,
    entries: payload?.entry?.length ?? 0,
    rawPayload: JSON.stringify(payload)
  });

  const incomingMessages =
    payload.entry?.flatMap((entry) =>
      entry.changes?.flatMap((change) =>
        change.value?.messages?.map((message) => ({
          from: message.from,
          // The routing key: which clinic's WhatsApp number this arrived on.
          phoneNumberId: change.value?.metadata?.phone_number_id,
          messageId: message.id,
          type: message.type,
          text: message.text?.body,
          // Set when the patient tapped an interactive button / list row.
          interactiveId: message.interactive?.button_reply?.id ?? message.interactive?.list_reply?.id,
          interactiveTitle: message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title,
          // Set when the patient sent a voice note / audio (type === 'audio').
          audioId: message.audio?.id,
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
          timestamp: status.timestamp,
          // Failed statuses carry an errors[] with the Graph error code/title.
          errorDetail: status.errors?.length
            ? status.errors
                .map(
                  (e) =>
                    `[${e.code ?? '?'}] ${e.title ?? e.message ?? 'error'}${
                      e.error_data?.details ? ` — ${e.error_data.details}` : ''
                    }`
                )
                .join('; ')
            : undefined
        })) ?? []
      ) ?? []
    ) ?? [];

  // Per-message breakdown: exactly which number said what. Makes multi-patient
  // debugging trivial — you can see every sender, not just the one that "works".
  console.info('[WhatsApp][webhook] parsed inbound', {
    messageCount: incomingMessages.length,
    statusCount: incomingStatuses.length,
    messages: incomingMessages.map((m) => ({ from: m.from, type: m.type, text: m.text }))
  });

  // Record the latest inbound (phone + text) for the diagnostics endpoint.
  for (const m of incomingMessages) {
    if (m.from) recordInbound(m.from, m.text ?? m.interactiveTitle ?? `[${m.type ?? 'non-text'}]`);
  }

  // Persist webhook side-effects. Wrapped so a DB hiccup never makes us return
  // non-200 — Meta retries on any non-200 and would replay the whole batch.
  let statusesPersisted = 0;
  try {
    // Delivery receipts advance the matching outbound log's status. (The 24h
    // session window is recorded per-clinic inside the inbound pipeline, once the
    // clinic has been resolved from phone_number_id.)
    const counts = await Promise.all(
      incomingStatuses
        .filter((s) => s.id && s.status)
        .map((s) => recordStatusUpdate(s.id as string, s.status as string, s.errorDetail))
    );
    statusesPersisted = counts.reduce((sum, c) => sum + c, 0);
  } catch (err) {
    console.error('[WhatsApp] Failed to persist webhook payload:', err);
  }

  // Auto-respond to inbound text. Fire-and-forget AFTER the side-effects above so
  // the reply (AI call + send) never delays the 200 Meta needs — a slow/non-200
  // response would make Meta retry and replay the whole batch.
  for (const m of incomingMessages) {
    if (!m.from) continue;
    if (m.type === 'text' && m.text) {
      void handleInboundText(m.from, m.text, m.messageId, undefined, { phoneNumberId: m.phoneNumberId }).catch((err) =>
        console.error('[WhatsApp] Inbound auto-reply failed:', err)
      );
    } else if (m.type === 'interactive' && m.interactiveId) {
      // Pass the tapped row/button title as the human-readable text (for logs /
      // audit) and the stable id as the routing key.
      void handleInboundText(m.from, m.interactiveTitle ?? m.interactiveId, m.messageId, m.interactiveId, {
        phoneNumberId: m.phoneNumberId
      }).catch((err) => console.error('[WhatsApp] Inbound interactive reply failed:', err));
    } else if (m.type === 'audio' && m.audioId) {
      // Voice note: transcribe (Whisper), then run it through the inbound pipeline
      // with AI understanding forced on. Enabled for everyone by default; set
      // WA_VOICE_TEST_NUMBERS to a number list to restrict, or "off" to disable.
      const from = m.from;
      const audioId = m.audioId;
      const messageId = m.messageId;
      const phoneNumberId = m.phoneNumberId;
      if (isVoiceAiEnabledFor(from)) {
        void (async () => {
          const transcript = await transcribeWhatsAppVoice(audioId, phoneNumberId);
          if (transcript) {
            await handleInboundText(from, transcript, messageId, undefined, { fromVoice: true, phoneNumberId });
          } else {
            // Couldn't understand the audio — ask the patient to type instead so
            // they're never left without a reply.
            await sendWhatsAppTextMessage({
              to: from.replace(/\D/g, ''),
              body: "Sorry, I couldn't understand that voice note. Please try again or type your message. 🙏",
              messageType: 'auto_reply'
            }).catch(() => undefined);
          }
        })().catch((err) => console.error('[WhatsApp] Inbound voice handling failed:', err));
      } else {
        console.info('[WhatsApp] Voice note ignored (voice AI disabled or number not allowed)', { from });
      }
    }
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

export const sendTemplateHandler = asyncHandler(async (req: Request, res: Response) => {
  const payload = req.body as SendWhatsAppTemplateInput;

  // Build the Graph API components from ordered params; omit for zero-variable templates.
  const components: TemplateComponent[] | undefined = payload.params?.length
    ? [{ type: 'body', parameters: payload.params.map((text) => ({ type: 'text', text })) }]
    : undefined;

  const response = await sendWhatsAppTemplateMessage({
    to: payload.to,
    templateName: payload.templateName as WhatsAppTemplateName,
    components,
    languageCode: payload.languageCode,
    bodyForLog: payload.bodyForLog ?? `${payload.templateName}: ${payload.params?.join(' | ') ?? ''}`.trim()
  });

  res.status(200).json({
    success: true,
    message: 'Template message sent successfully',
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

// GET /api/whatsapp/debug — webhook reliability snapshot (auth-protected: it
// exposes the last inbound phone/message, which is patient PII).
export const webhookDebugHandler = asyncHandler(async (req: Request, res: Response) => {
  // Echo back the host the request actually arrived on — compare to the
  // configured webhook URL to spot a stale tunnel / wrong Meta callback.
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? req.protocol;
  const host = req.get('host');
  const seenUrl = host ? `${proto}://${host}${WEBHOOK_PATH}` : null;

  const data = await buildDiagnostics(seenUrl);
  res.status(200).json({ success: true, message: 'WhatsApp webhook diagnostics', data });
});