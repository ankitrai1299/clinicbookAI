import axios, { AxiosResponse } from 'axios';

import { prisma } from '../../config/prisma.js';
import { getWhatsAppApiClient, getWhatsAppPhoneNumberId } from '../../config/whatsapp.js';
import {
  TemplateComponent,
  WHATSAPP_TEMPLATE_LANGUAGE,
  WhatsAppTemplateName
} from './whatsapp.templates.js';
import { WhatsAppTextMessageInput } from './whatsapp.types.js';

interface WhatsAppSendMessageResponse {
  messaging_product?: string;
  contacts?: Array<{ input?: string; wa_id?: string }>;
  messages?: Array<{ id?: string }>;
}

// WhatsApp's customer-service window: free-form ("session") messages are only
// deliverable within 24h of the recipient's last inbound message. Outside it,
// Meta accepts approved templates only.
const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

const extractWaMessageId = (data: WhatsAppSendMessageResponse): string | undefined =>
  data.messages?.[0]?.id;

const describeError = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    return JSON.stringify(error.response?.data ?? { message: error.message });
  }
  return error instanceof Error ? error.message : String(error);
};

// Persist every outbound send so status (sent → delivered/read/failed) is queryable.
const logOutbound = async (params: {
  to: string;
  messageType: string;
  body: string;
  clinicId?: string | null;
  waMessageId?: string;
  status: string;
  error?: string;
}): Promise<void> => {
  try {
    await prisma.whatsAppLog.create({
      data: {
        to: params.to,
        messageType: params.messageType,
        body: params.body,
        clinicId: params.clinicId ?? null,
        waMessageId: params.waMessageId ?? null,
        status: params.status,
        error: params.error ?? null
      }
    });
  } catch (err) {
    // Logging must never break the actual send.
    console.error('[WhatsApp] Failed to write WhatsAppLog:', err);
  }
};

export const sendWhatsAppTextMessage = async (
  input: WhatsAppTextMessageInput & { clinicId?: string | null }
): Promise<AxiosResponse<WhatsAppSendMessageResponse>> => {
  const phoneNumberId = getWhatsAppPhoneNumberId();
  const client = getWhatsAppApiClient();

  try {
    const response = await client.post<WhatsAppSendMessageResponse>(`/${phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: input.to,
      type: 'text',
      text: {
        preview_url: input.previewUrl ?? false,
        body: input.body
      }
    });

    await logOutbound({
      to: input.to,
      messageType: 'session_text',
      body: input.body,
      clinicId: input.clinicId,
      waMessageId: extractWaMessageId(response.data),
      status: 'sent'
    });

    return response;
  } catch (error) {
    await logOutbound({
      to: input.to,
      messageType: 'session_text',
      body: input.body,
      clinicId: input.clinicId,
      status: 'failed',
      error: describeError(error)
    });
    throw error;
  }
};

export const sendWhatsAppTemplateMessage = async (params: {
  to: string;
  templateName: WhatsAppTemplateName;
  components?: TemplateComponent[];
  languageCode?: string;
  // Human-readable rendering stored in WhatsAppLog.body for auditing.
  bodyForLog: string;
  clinicId?: string | null;
}): Promise<AxiosResponse<WhatsAppSendMessageResponse>> => {
  const phoneNumberId = getWhatsAppPhoneNumberId();
  const client = getWhatsAppApiClient();

  try {
    const response = await client.post<WhatsAppSendMessageResponse>(`/${phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: params.to,
      type: 'template',
      template: {
        name: params.templateName,
        language: { code: params.languageCode ?? WHATSAPP_TEMPLATE_LANGUAGE },
        ...(params.components ? { components: params.components } : {})
      }
    });

    await logOutbound({
      to: params.to,
      messageType: `template:${params.templateName}`,
      body: params.bodyForLog,
      clinicId: params.clinicId,
      waMessageId: extractWaMessageId(response.data),
      status: 'sent'
    });

    return response;
  } catch (error) {
    await logOutbound({
      to: params.to,
      messageType: `template:${params.templateName}`,
      body: params.bodyForLog,
      clinicId: params.clinicId,
      status: 'failed',
      error: describeError(error)
    });
    throw error;
  }
};

// True when the recipient messaged us within the last 24h (session window open).
export const isConversationWindowOpen = async (phone: string): Promise<boolean> => {
  const convo = await prisma.whatsAppConversation.findUnique({
    where: { phone },
    select: { lastInboundAt: true }
  });

  if (!convo) {
    return false;
  }

  return Date.now() - convo.lastInboundAt.getTime() < SESSION_WINDOW_MS;
};

// Called from the inbound webhook to (re)open the 24h session window.
export const recordInboundMessage = async (phone: string, timestampSeconds?: string): Promise<void> => {
  const parsed = timestampSeconds ? new Date(Number(timestampSeconds) * 1000) : new Date();
  const when = Number.isNaN(parsed.getTime()) ? new Date() : parsed;

  await prisma.whatsAppConversation.upsert({
    where: { phone },
    create: { phone, lastInboundAt: when },
    update: { lastInboundAt: when }
  });
};

// Called from the status webhook to advance a logged message's delivery status.
// Returns how many log rows matched (0 means the wamid wasn't one of ours).
export const recordStatusUpdate = async (
  waMessageId: string,
  status: string,
  errorDetail?: string
): Promise<number> => {
  const result = await prisma.whatsAppLog.updateMany({
    where: { waMessageId },
    data: { status, ...(errorDetail ? { error: errorDetail } : {}) }
  });

  return result.count;
};

// Prefer a free-form session message when the 24h window is open (richer, no
// template approval needed); otherwise fall back to the approved template.
export const sendTemplatedOrSession = async (params: {
  to: string;
  templateName: WhatsAppTemplateName;
  components?: TemplateComponent[];
  sessionBody: string;
  clinicId?: string | null;
}): Promise<{ channel: 'session' | 'template' }> => {
  if (await isConversationWindowOpen(params.to)) {
    await sendWhatsAppTextMessage({
      to: params.to,
      body: params.sessionBody,
      clinicId: params.clinicId
    });
    return { channel: 'session' };
  }

  await sendWhatsAppTemplateMessage({
    to: params.to,
    templateName: params.templateName,
    components: params.components,
    bodyForLog: params.sessionBody,
    clinicId: params.clinicId
  });
  return { channel: 'template' };
};

export const exampleSendMessageFunction = async () => {
  return sendWhatsAppTextMessage({
    to: '15551234567',
    body: 'Hello from ClinicBook AI. Your appointment is confirmed.'
  });
};
