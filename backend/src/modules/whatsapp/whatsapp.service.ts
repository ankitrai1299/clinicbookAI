import axios, { AxiosResponse } from 'axios';

import { prisma } from '../../config/prisma.js';
import { getWhatsAppApiClient, getWhatsAppPhoneNumberId } from '../../config/whatsapp.js';
import { noteSendFailure, noteSendSuccess } from './whatsapp.alerts.js';
import { isTokenExpiredError, withRetry } from './whatsapp.retry.js';
import {
  TemplateComponent,
  WHATSAPP_TEMPLATE_LANGUAGE,
  WhatsAppTemplateName
} from './whatsapp.templates.js';
import { WhatsAppTextMessageInput } from './whatsapp.types.js';
import { InteractiveReply, botReplyText } from './whatsapp.reply.js';

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

// Test-only send seam (NEVER set in production). Lets hermetic tests exercise
// the send paths without hitting the Graph API:
//   WA_TEST_NO_SEND=1     → every send is a synthetic success (no network call)
//   WA_TEST_NO_SEND=fail  → every send throws (simulate a delivery failure)
// Read per-call so a test can toggle it between scenarios.
const interceptSend = (label: string): AxiosResponse<WhatsAppSendMessageResponse> | null => {
  const mode = process.env.WA_TEST_NO_SEND;
  if (!mode) return null;
  if (mode === 'fail') {
    throw new Error(`[test] simulated WhatsApp ${label} delivery failure`);
  }
  console.info(`[WhatsApp][test] WA_TEST_NO_SEND — synthetic ${label} success (no Graph call)`);
  return { data: { messages: [{ id: `TEST_${label}` }] } } as AxiosResponse<WhatsAppSendMessageResponse>;
};

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
  const intercepted = interceptSend('text');
  if (intercepted) return intercepted;

  const phoneNumberId = getWhatsAppPhoneNumberId();
  const client = getWhatsAppApiClient();
  const messageType = input.messageType ?? 'session_text';

  try {
    const response = await withRetry(
      () =>
        client.post<WhatsAppSendMessageResponse>(`/${phoneNumberId}/messages`, {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: input.to,
          type: 'text',
          text: {
            preview_url: input.previewUrl ?? false,
            body: input.body
          }
        }),
      {
        onRetry: ({ attempt, delayMs, error }) =>
          console.warn(
            `[WhatsApp] text send to ${input.to} failed (attempt ${attempt}) — retrying in ${delayMs}ms: ${describeError(error)}`
          )
      }
    );

    await logOutbound({
      to: input.to,
      messageType,
      body: input.body,
      clinicId: input.clinicId,
      waMessageId: extractWaMessageId(response.data),
      status: 'sent'
    });
    noteSendSuccess();

    return response;
  } catch (error) {
    const tokenExpired = isTokenExpiredError(error);
    const detail = describeError(error);
    console.error(
      `[WhatsApp] text send to ${input.to} FAILED after retries${tokenExpired ? ' (ACCESS TOKEN EXPIRED)' : ''}: ${detail}`
    );
    await logOutbound({
      to: input.to,
      messageType,
      body: input.body,
      clinicId: input.clinicId,
      status: 'failed',
      error: `${tokenExpired ? '[token_expired] ' : ''}${detail}`
    });
    noteSendFailure({ clinicId: input.clinicId, tokenExpired, error: detail });
    throw error;
  }
};

// --- Interactive (buttons / list) messages --------------------------------
// Build the Graph API `interactive` payload from a BotReply, enforcing Meta's
// length limits (silently truncating titles/bodies that would otherwise be
// rejected with a 400).
const trunc = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const buildInteractivePayload = (r: InteractiveReply): Record<string, unknown> => {
  const header = r.header ? { header: { type: 'text', text: trunc(r.header, 60) } } : {};
  const footer = r.footer ? { footer: { text: trunc(r.footer, 60) } } : {};
  const body = { body: { text: trunc(r.body, 1024) } };

  if (r.kind === 'buttons') {
    return {
      type: 'button',
      ...header,
      ...body,
      ...footer,
      action: {
        buttons: r.buttons.slice(0, 3).map((b) => ({
          type: 'reply',
          reply: { id: b.id.slice(0, 256), title: trunc(b.title, 20) }
        }))
      }
    };
  }

  return {
    type: 'list',
    ...header,
    ...body,
    ...footer,
    action: {
      button: trunc(r.button, 20),
      sections: [
        {
          ...(r.sectionTitle ? { title: trunc(r.sectionTitle, 24) } : {}),
          rows: r.rows.slice(0, 10).map((row) => ({
            id: row.id.slice(0, 200),
            title: trunc(row.title, 24),
            ...(row.description ? { description: trunc(row.description, 72) } : {})
          }))
        }
      ]
    }
  };
};

export const sendWhatsAppInteractive = async (input: {
  to: string;
  reply: InteractiveReply;
  messageType?: string;
  clinicId?: string | null;
}): Promise<AxiosResponse<WhatsAppSendMessageResponse>> => {
  const phoneNumberId = getWhatsAppPhoneNumberId();
  const client = getWhatsAppApiClient();
  const messageType = input.messageType ?? 'interactive';
  const bodyForLog = botReplyText(input.reply);

  try {
    const response = await withRetry(
      () =>
        client.post<WhatsAppSendMessageResponse>(`/${phoneNumberId}/messages`, {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: input.to,
          type: 'interactive',
          interactive: buildInteractivePayload(input.reply)
        }),
      {
        onRetry: ({ attempt, delayMs, error }) =>
          console.warn(
            `[WhatsApp] interactive send to ${input.to} failed (attempt ${attempt}) — retrying in ${delayMs}ms: ${describeError(error)}`
          )
      }
    );

    await logOutbound({
      to: input.to,
      messageType,
      body: bodyForLog,
      clinicId: input.clinicId,
      waMessageId: extractWaMessageId(response.data),
      status: 'sent'
    });
    noteSendSuccess();

    return response;
  } catch (error) {
    const tokenExpired = isTokenExpiredError(error);
    const detail = describeError(error);
    console.error(
      `[WhatsApp] interactive send to ${input.to} FAILED after retries${tokenExpired ? ' (ACCESS TOKEN EXPIRED)' : ''}: ${detail}`
    );
    await logOutbound({
      to: input.to,
      messageType,
      body: bodyForLog,
      clinicId: input.clinicId,
      status: 'failed',
      error: `${tokenExpired ? '[token_expired] ' : ''}${detail}`
    });
    noteSendFailure({ clinicId: input.clinicId, tokenExpired, error: detail });
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
  const intercepted = interceptSend('template');
  if (intercepted) return intercepted;

  const phoneNumberId = getWhatsAppPhoneNumberId();
  const client = getWhatsAppApiClient();
  const messageType = `template:${params.templateName}`;

  try {
    const response = await withRetry(
      () =>
        client.post<WhatsAppSendMessageResponse>(`/${phoneNumberId}/messages`, {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: params.to,
          type: 'template',
          template: {
            name: params.templateName,
            language: { code: params.languageCode ?? WHATSAPP_TEMPLATE_LANGUAGE },
            ...(params.components ? { components: params.components } : {})
          }
        }),
      {
        onRetry: ({ attempt, delayMs, error }) =>
          console.warn(
            `[WhatsApp] template send to ${params.to} failed (attempt ${attempt}) — retrying in ${delayMs}ms: ${describeError(error)}`
          )
      }
    );

    await logOutbound({
      to: params.to,
      messageType,
      body: params.bodyForLog,
      clinicId: params.clinicId,
      waMessageId: extractWaMessageId(response.data),
      status: 'sent'
    });
    noteSendSuccess();

    return response;
  } catch (error) {
    const tokenExpired = isTokenExpiredError(error);
    const detail = describeError(error);
    console.error(
      `[WhatsApp] template send to ${params.to} FAILED after retries${tokenExpired ? ' (ACCESS TOKEN EXPIRED)' : ''}: ${detail}`
    );
    await logOutbound({
      to: params.to,
      messageType,
      body: params.bodyForLog,
      clinicId: params.clinicId,
      status: 'failed',
      error: `${tokenExpired ? '[token_expired] ' : ''}${detail}`
    });
    noteSendFailure({ clinicId: params.clinicId, tokenExpired, error: detail });
    throw error;
  }
};

// Persist an inbound (patient → clinic) message for auditing. Stored with the
// patient's number in `to` and direction marked via messageType 'inbound_text';
// status 'received' (inbound has no delivery lifecycle).
export const logInboundMessage = async (params: {
  from: string;
  body: string;
  waMessageId?: string;
  clinicId?: string | null;
}): Promise<void> => {
  try {
    await prisma.whatsAppLog.create({
      data: {
        to: params.from,
        messageType: 'inbound_text',
        body: params.body,
        clinicId: params.clinicId ?? null,
        waMessageId: params.waMessageId ?? null,
        status: 'received'
      }
    });
  } catch (err) {
    console.error('[WhatsApp] Failed to log inbound message:', err);
  }
};

// Persist one audit row per inbound receptionist turn (best-effort). Records
// what was understood (intent/confidence/speciality), the FSM state transition,
// and any terminal booking action — the trail proving the AI only understood and
// the FSM owned every transition. Never throws (auditing must not break a reply).
export const recordWhatsAppAudit = async (a: {
  phone: string;
  clinicId?: string | null;
  patientId?: string | null;
  message: string;
  intent?: string | null;
  confidence?: number | null;
  speciality?: string | null;
  fsmStateFrom?: string | null;
  fsmStateTo?: string | null;
  action?: string | null;
  source?: string | null;
}): Promise<void> => {
  try {
    await prisma.whatsAppAudit.create({
      data: {
        phone: a.phone,
        clinicId: a.clinicId ?? null,
        patientId: a.patientId ?? null,
        message: a.message,
        intent: a.intent ?? null,
        confidence: a.confidence ?? null,
        speciality: a.speciality ?? null,
        fsmStateFrom: a.fsmStateFrom ?? null,
        fsmStateTo: a.fsmStateTo ?? null,
        action: a.action ?? null,
        source: a.source ?? 'fsm'
      }
    });
  } catch (err) {
    console.error('[WhatsApp] Failed to write WhatsAppAudit:', err);
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
}): Promise<{ channel: 'session' | 'template'; waMessageId?: string }> => {
  if (await isConversationWindowOpen(params.to)) {
    const res = await sendWhatsAppTextMessage({
      to: params.to,
      body: params.sessionBody,
      clinicId: params.clinicId
    });
    return { channel: 'session', waMessageId: extractWaMessageId(res.data) };
  }

  const res = await sendWhatsAppTemplateMessage({
    to: params.to,
    templateName: params.templateName,
    components: params.components,
    bodyForLog: params.sessionBody,
    clinicId: params.clinicId
  });
  return { channel: 'template', waMessageId: extractWaMessageId(res.data) };
};

export const exampleSendMessageFunction = async () => {
  return sendWhatsAppTextMessage({
    to: '15551234567',
    body: 'Hello from ClinicBook AI. Your appointment is confirmed.'
  });
};
