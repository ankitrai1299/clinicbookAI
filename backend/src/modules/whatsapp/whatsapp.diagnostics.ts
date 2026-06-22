// WhatsApp webhook observability — startup banner + live diagnostics.
//
// All counters are in-process (single-instance backend, same model as the
// inbound dedup/serialization maps). The total resets on restart by design; a
// persistent inbound count is read from WhatsAppLog in the /debug handler.
//
// This module changes NO booking behaviour — it only records and reports.

import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { isWhatsAppConfigured } from '../../config/whatsapp.js';

export const WEBHOOK_PATH = '/api/whatsapp/webhook';

// The webhook URL we believe we're reachable at (from PUBLIC_BASE_URL).
export const getConfiguredWebhookUrl = (): string => {
  const base = env.PUBLIC_BASE_URL?.replace(/\/+$/, '') ?? `http://localhost:${env.PORT}`;
  return `${base}${WEBHOOK_PATH}`;
};

export const isSignatureVerificationEnabled = (): boolean => Boolean(env.WHATSAPP_APP_SECRET);

interface WebhookStats {
  startedAt: string;
  totalWebhookHits: number;
  lastWebhookHitAt: string | null;
  lastInboundPhone: string | null;
  lastInboundMessage: string | null;
  lastInboundAt: string | null;
  lastOutboundReply: string | null;
  lastOutboundAt: string | null;
}

const stats: WebhookStats = {
  startedAt: new Date().toISOString(),
  totalWebhookHits: 0,
  lastWebhookHitAt: null,
  lastInboundPhone: null,
  lastInboundMessage: null,
  lastInboundAt: null,
  lastOutboundReply: null,
  lastOutboundAt: null
};

// Called once per inbound webhook POST (every hit, including status-only ones).
export const recordWebhookHit = (): void => {
  stats.totalWebhookHits += 1;
  stats.lastWebhookHitAt = new Date().toISOString();
};

// Called per inbound patient message extracted from the payload.
export const recordInbound = (phone: string, message: string): void => {
  stats.lastInboundPhone = phone;
  stats.lastInboundMessage = message;
  stats.lastInboundAt = new Date().toISOString();
};

// Called with the single reply the receptionist sends back.
export const recordOutbound = (reply: string): void => {
  stats.lastOutboundReply = reply;
  stats.lastOutboundAt = new Date().toISOString();
};

export const getWebhookStats = (): WebhookStats => ({ ...stats });

// Snapshot for GET /api/whatsapp/debug. `webhookUrlSeenFromRequest` echoes the
// host the request actually arrived on — compare it to the configured URL to
// catch a stale tunnel / wrong Meta callback at a glance.
export const buildDiagnostics = async (webhookUrlSeenFromRequest: string | null) => {
  let clinicName: string | null = null;
  try {
    if (env.WHATSAPP_CLINIC_ID) {
      const clinic = await prisma.clinic.findUnique({
        where: { id: env.WHATSAPP_CLINIC_ID },
        select: { name: true }
      });
      clinicName = clinic?.name ?? null;
    }
  } catch {
    clinicName = null;
  }

  let inboundLoggedTotal: number | null = null;
  try {
    inboundLoggedTotal = await prisma.whatsAppLog.count({ where: { messageType: 'inbound_text' } });
  } catch {
    inboundLoggedTotal = null;
  }

  const s = getWebhookStats();
  return {
    ...s,
    uptimeSeconds: Math.round(process.uptime()),
    clinicId: env.WHATSAPP_CLINIC_ID ?? null,
    clinicName,
    whatsappConfigured: isWhatsAppConfigured(),
    signatureVerification: isSignatureVerificationEnabled() ? 'ENABLED' : 'DISABLED',
    webhookUrlConfigured: getConfiguredWebhookUrl(),
    webhookUrlSeenFromRequest,
    inboundLoggedTotal, // persistent (survives restart), from WhatsAppLog
    // AI Receptionist feature flags AS SEEN BY THIS RUNNING PROCESS — the ground
    // truth for "are the new experience flags actually live?". If these read OFF,
    // patients get the legacy plain numbered menu no matter what the repo/.env say.
    receptionist: {
      aiUnderstanding: env.WA_AI_RECEPTIONIST ? 'ON' : 'OFF',
      interactiveMessages: env.WA_INTERACTIVE ? 'ON' : 'OFF',
      confidenceMin: env.WA_AI_CONFIDENCE_MIN,
      openAiKey: env.OPENAI_API_KEY ? 'set' : 'MISSING',
      // The effective mode a patient will experience right now.
      effectiveMode: env.WA_AI_RECEPTIONIST
        ? env.OPENAI_API_KEY
          ? `AI receptionist${env.WA_INTERACTIVE ? ' + interactive buttons' : ' (plain text)'}`
          : `deterministic${env.WA_INTERACTIVE ? ' + interactive buttons' : ''} (WA_AI_RECEPTIONIST on but OPENAI_API_KEY missing)`
        : `legacy deterministic menu${env.WA_INTERACTIVE ? ' + interactive buttons' : ' (plain numbered text)'}`
    }
  };
};

// Printed once on server start so the operator can confirm the binding without
// digging through env/DB.
export const logWhatsAppStartupInfo = async (): Promise<void> => {
  let clinicName = '(unknown)';
  try {
    if (env.WHATSAPP_CLINIC_ID) {
      const clinic = await prisma.clinic.findUnique({
        where: { id: env.WHATSAPP_CLINIC_ID },
        select: { name: true }
      });
      clinicName = clinic?.name ?? `(no clinic matches id ${env.WHATSAPP_CLINIC_ID})`;
    } else {
      clinicName = '(WHATSAPP_CLINIC_ID unset — inbound uses fallback clinic)';
    }
  } catch {
    clinicName = '(clinic lookup failed)';
  }

  console.info(`[WhatsApp] Clinic: ${clinicName}`);
  console.info(`[WhatsApp] Clinic ID: ${env.WHATSAPP_CLINIC_ID ?? '(unset)'}`);
  console.info(`[WhatsApp] Webhook: ${getConfiguredWebhookUrl()}`);
  console.info(`[WhatsApp] Signature verification: ${isSignatureVerificationEnabled() ? 'ENABLED' : 'DISABLED'}`);
  console.info(`[WhatsApp] WhatsApp API configured: ${isWhatsAppConfigured() ? 'YES' : 'NO'}`);
  console.info(
    `[WhatsApp] Receptionist: AI=${env.WA_AI_RECEPTIONIST ? 'ON' : 'OFF'} | Interactive=${env.WA_INTERACTIVE ? 'ON' : 'OFF'} | OpenAI key=${env.OPENAI_API_KEY ? 'set' : 'MISSING'}`
  );
  if (!env.PUBLIC_BASE_URL) {
    console.warn('[WhatsApp] PUBLIC_BASE_URL is not set — webhook URL shown is localhost. Set it to your tunnel/Railway domain so it matches the Meta callback.');
  }
};
