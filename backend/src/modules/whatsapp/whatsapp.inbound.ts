// Inbound WhatsApp orchestrator — the single entry point for the patient bot.
//
//   User → WhatsApp → Webhook → [this orchestrator] → OpenAI → tools → ONE reply
//
// Production guarantees:
//  1. Exactly ONE reply per inbound message (one agent call → one send).
//  2. Idempotency: Meta delivers webhooks at-least-once. We dedupe by inbound
//     message id so a retried/duplicated delivery never produces a second reply.
//  3. Per-sender serialization: messages from the same number are processed one
//     at a time, in arrival order, so each turn sees the previous turn's reply in
//     history (no context races, no interleaved/"multiple bot" replies).
//  4. No side-channel auto-responders: the only outbound on the inbound path is
//     this orchestrator's single reply (the booking tool suppresses its own
//     confirmation — see createAppointment notify:false).
//
// NOTE: dedup + serialization are in-process, which is correct for the current
// single-instance backend. Horizontal scaling would need a shared store (Redis /
// DB row lock) keyed on the same ids.

import { prisma } from '../../config/prisma.js';
import { forClinic } from '../../config/tenantPrisma.js';
import { env } from '../../config/env.js';
import { isWhatsAppConfigured } from '../../config/whatsapp.js';
import { handleWhatsAppMessage } from './whatsapp.booking.js';
import { resolveClinicIdByPhoneNumberId } from './whatsapp.channel.js';
import {
  logInboundMessage,
  recordInboundMessage,
  sendWhatsAppInteractive,
  sendWhatsAppTextMessage
} from './whatsapp.service.js';
import { type BotReply, botReplyText } from './whatsapp.reply.js';
import { recordOutbound } from './whatsapp.diagnostics.js';

// Last-resort reply so the assistant is NEVER silent, even if OpenAI, the DB, or
// a tool fails. A patient message must always be answered.
const SAFE_FALLBACK =
  "Thanks for your message! 🙏 I had a brief technical hiccup just now. " +
  'Please send that again in a moment — I can help you book, reschedule, cancel, or check an appointment.';

const PLATFORM_CLINIC_EMAIL = 'platform@clinicbook.ai';

// --- Idempotency: remember recently-processed inbound message ids. ----------
const processedMessageIds = new Set<string>();
const DEDUP_MAX = 1000;
const markProcessed = (id: string) => {
  processedMessageIds.add(id);
  if (processedMessageIds.size > DEDUP_MAX) {
    // Evict oldest (insertion order) to bound memory.
    const oldest = processedMessageIds.values().next().value;
    if (oldest !== undefined) processedMessageIds.delete(oldest);
  }
};

// --- Per-sender serialization: a tail-promise chain keyed by phone. ---------
const queues = new Map<string, Promise<void>>();

// Phone numbers reach us in many shapes: Meta sends digits-only international
// ("917903884686"), while clinics may have stored the patient as "7903884686",
// "+91 7903884686", etc. Matching on the raw string misses these, so we compare
// on the national number (last 10 digits) — the part that is stable across
// country-code/formatting differences.
const digitsOnly = (s: string): string => s.replace(/\D/g, '');
const nationalKey = (s: string): string => {
  const d = digitsOnly(s);
  return d.length > 10 ? d.slice(-10) : d;
};

// Which clinic owns the WhatsApp number every inbound message arrives on. The
// patient does NOT determine the clinic — the clinic owns the conversation, so a
// brand-new sender is still bound to the right clinic (and lands in that admin's
// dashboard). Configured via WHATSAPP_CLINIC_ID. (Future: map
// metadata.phone_number_id here.)
//
// In PRODUCTION we refuse to GUESS a clinic: if WHATSAPP_CLINIC_ID is unset or
// points at a non-existent clinic we return null (the caller then sends a safe
// "being set up" message) rather than silently routing a real patient's booking
// into some other clinic's dashboard. Only outside production do we fall back to
// the most set-up clinic, so local/demo keeps working without configuration.
export type ClinicBindingDecision = 'use-configured' | 'refuse' | 'fallback';

// Pure policy for which clinic an inbound message binds to. Extracted so it can
// be unit-tested without a DB or env mutation. In production a missing or
// unresolvable WHATSAPP_CLINIC_ID means REFUSE (never guess); only outside
// production do we fall back to the most set-up clinic.
export const decideClinicBinding = (params: {
  hasConfiguredId: boolean;
  configuredResolves: boolean;
  isProduction: boolean;
}): ClinicBindingDecision => {
  if (params.hasConfiguredId && params.configuredResolves) {
    return 'use-configured';
  }
  return params.isProduction ? 'refuse' : 'fallback';
};

// Resolve the clinic that owns the inbound WhatsApp number. PRIMARY path: map the
// webhook's metadata.phone_number_id → clinic via WhatsAppChannel (with the env
// default channel as a fallback for the original number). This is what makes the
// platform multi-tenant: a message to clinic A's number can only ever bind to
// clinic A. Production refuses to guess; only dev/demo falls back to the most
// set-up clinic so local works without channel configuration.
let cachedFallbackClinicId: string | null = null;
const resolveInboundClinicId = async (phoneNumberId?: string | null): Promise<string | null> => {
  const byChannel = await resolveClinicIdByPhoneNumberId(phoneNumberId);
  if (byChannel) return byChannel;

  if (env.NODE_ENV === 'production') {
    console.error(
      '[WhatsApp] No clinic for inbound phone_number_id — create a WhatsAppChannel for this number (or set WHATSAPP_CLINIC_ID for the env default).',
      { phoneNumberId: phoneNumberId ?? null }
    );
    return null;
  }

  if (cachedFallbackClinicId) return cachedFallbackClinicId;
  const clinic = await prisma.clinic.findFirst({
    where: { email: { not: PLATFORM_CLINIC_EMAIL } },
    orderBy: { doctors: { _count: 'desc' } },
    select: { id: true }
  });
  cachedFallbackClinicId = clinic?.id ?? null;
  return cachedFallbackClinicId;
};

// Find the patient for this number WITHIN the bound clinic, or onboard them.
// First inbound from an unknown number auto-creates a patient (a real, bookable
// resource) so the booking agent can act immediately — no /register step, no loop.
const findOrCreatePatient = async (clinicId: string, phone: string) => {
  const db = forClinic(clinicId);
  const national = nationalKey(phone);
  const include = { clinic: { select: { id: true, name: true } } } as const;

  console.info('[WhatsApp][resolve] lookup', { inboundPhone: phone, nationalKey: national, clinicId });

  if (national) {
    // Fast path: substring match on the contiguous national digits.
    const candidates = await db.patient.findMany({
      where: { clinicId, phone: { contains: national } },
      orderBy: { createdAt: 'desc' },
      include
    });
    let found = candidates.find((p) => nationalKey(p.phone) === national);

    // Robust fallback: a number stored WITH formatting (e.g. "+91 98765 43210")
    // has a space inside it, so the contiguous national digits won't substring-
    // match and the fast path misses it. Rather than create a DUPLICATE patient
    // for the same human, scan the clinic's patients and compare on normalized
    // national keys. This is what makes resolution work for EVERY number format,
    // not just clean digit strings.
    if (!found) {
      const all = await db.patient.findMany({ where: { clinicId }, orderBy: { createdAt: 'desc' }, include });
      found = all.find((p) => nationalKey(p.phone) === national);
      if (found) {
        console.info('[WhatsApp][resolve] matched via normalized fallback (formatted stored number)', {
          patientId: found.patientCode ?? found.id,
          storedPhone: found.phone
        });
      }
    }

    if (found) {
      console.info('[WhatsApp][resolve] matched existing patient', {
        patientId: found.patientCode ?? found.id,
        storedPhone: found.phone,
        name: found.name,
        source: found.source
      });
      return found;
    }
  }

  const digits = digitsOnly(phone);
  const created = await db.patient.create({
    data: {
      clinicId,
      name: `WhatsApp Patient ${digits.slice(-4)}`,
      phone: digits,
      language: 'English',
      source: 'whatsapp'
    },
    include
  });
  console.info('[WhatsApp][resolve] no match — auto-onboarded NEW patient', {
    patientId: created.patientCode ?? created.id,
    storedPhone: created.phone
  });
  return created;
};

// The actual work for one message: log inbound, get exactly one reply, send it.
//
// Booking is owned ENTIRELY by the deterministic FSM (handleWhatsAppMessage).
// There is NO AI-driven receptionist on this path: patientAgentReply and
// patientAssistantReply are deliberately NOT called. The only outbound for an
// inbound message is the FSM's single reply. If no clinic can be bound we send a
// fixed, deterministic message (still no AI) so the patient is never left silent.
const processOne = async (
  from: string,
  text: string,
  inboundWamid?: string,
  interactiveId?: string,
  fromVoice?: boolean,
  phoneNumberId?: string | null
): Promise<void> => {
  const to = from.replace(/\D/g, '');
  let clinicId: string | null = null;
  // null === the FSM deliberately chose to stay silent (no outbound at all).
  // A BotReply is either a plain string or an interactive (buttons/list) reply.
  let reply: BotReply | null = SAFE_FALLBACK;
  let patientCode: string | null = null;

  try {
    clinicId = await resolveInboundClinicId(phoneNumberId);
    await logInboundMessage({ from: to, body: text, waMessageId: inboundWamid, clinicId }).catch(() => undefined);
    // Refresh the 24h WhatsApp session window (per clinic) on every processed
    // inbound, keyed on the same digits-only number the send path checks. Uses
    // server time so it can't be left stale by a missing/old Meta timestamp. Only
    // once the clinic is known — the window is per (clinicId, phone).
    if (clinicId) await recordInboundMessage(clinicId, to).catch(() => undefined);

    if (clinicId) {
      const patient = await findOrCreatePatient(clinicId, from);
      patientCode = patient.patientCode;
      // Deterministic booking state machine owns the ENTIRE conversation. No AI
      // controls flow, picks doctors, or books — every reply is FSM-generated.
      // A null result means "stay silent" (non-actionable chatter once the
      // booking/conversation is settled) — keep it null so nothing is sent.
      const fsmReply = await handleWhatsAppMessage({
        clinicId,
        patientId: patient.id,
        patientName: patient.name,
        clinicName: patient.clinic?.name ?? 'our clinic',
        phone: to,
        patientCode: patient.patientCode,
        message: text,
        replyId: interactiveId,
        fromVoice
      });
      // null = stay silent. A plain string is trimmed (empty → safe fallback);
      // an interactive reply is passed through untouched.
      reply =
        fsmReply === null
          ? null
          : typeof fsmReply === 'string'
            ? fsmReply.trim() || SAFE_FALLBACK
            : fsmReply;
    } else {
      // No clinic bound → cannot run the FSM (it needs a clinic's doctors). Send a
      // FIXED deterministic message. Never fall back to an AI responder.
      console.warn('[WhatsApp] No clinic bound for inbound — set WHATSAPP_CLINIC_ID.');
      reply =
        'Thanks for your message! 🙏 Our booking line is being set up right now. ' +
        'Please try again shortly.';
    }
  } catch (err) {
    console.error('[WhatsApp] Reply generation failed — sending safe fallback:', err);
    reply = SAFE_FALLBACK;
  }

  // Silent turn: the FSM decided this message needs no reply (e.g. "ok"/"thanks"
  // after a completed booking). Send nothing — the inbound is still logged above.
  if (reply === null) {
    console.info('[WhatsApp] FSM stayed silent — no reply sent (non-actionable message in a settled state).', {
      phone: to
    });
    return;
  }

  // Record the reply for diagnostics before sending (so /debug reflects it even
  // if the Meta send fails). Interactive replies are flattened to text.
  recordOutbound(botReplyText(reply));

  // Guaranteed single outbound reply. A send failure is logged, not thrown.
  // Plain string → text message; interactive reply → buttons/list message.
  try {
    const res =
      typeof reply === 'string'
        ? await sendWhatsAppTextMessage({ to, body: reply, messageType: 'auto_reply', clinicId })
        : await sendWhatsAppInteractive({ to, reply, messageType: 'auto_reply', clinicId });
    console.info('[WhatsApp] Inbound reply sent', {
      phone: to,
      clinicId,
      patientId: patientCode,
      inboundText: text,
      interactiveId: interactiveId ?? null,
      inboundWamid: inboundWamid ?? null,
      outboundWamid: res.data.messages?.[0]?.id ?? null
    });
  } catch (sendErr) {
    console.error('[WhatsApp] Reply send failed:', sendErr);
  }
};

// Public entry point called by the webhook controller for each inbound message.
// `text` is the human-readable text (the typed message, or the title of a tapped
// button/row); `interactiveId` is the stable option id when the patient tapped
// an interactive reply. Returns the queued promise so the controller can attach
// a .catch.
export const handleInboundText = (
  from: string,
  text: string,
  inboundWamid?: string,
  interactiveId?: string,
  options?: { fromVoice?: boolean; phoneNumberId?: string | null }
): Promise<void> => {
  if (!isWhatsAppConfigured()) {
    return Promise.resolve();
  }

  // 1. Idempotency — drop duplicate/retried deliveries of the same message.
  if (inboundWamid) {
    if (processedMessageIds.has(inboundWamid)) {
      console.info('[WhatsApp] Duplicate inbound ignored (idempotency)', { inboundWamid });
      return Promise.resolve();
    }
    markProcessed(inboundWamid);
  }

  // 2. Serialize per sender so turns are handled one-at-a-time, in order.
  const key = from.replace(/\D/g, '');
  const prev = queues.get(key) ?? Promise.resolve();
  const next = prev
    .catch(() => undefined) // a failed prior turn must not block the next one
    .then(() => processOne(from, text, inboundWamid, interactiveId, options?.fromVoice, options?.phoneNumberId))
    .catch((err) => console.error('[WhatsApp] Inbound processing failed:', err));

  queues.set(
    key,
    next.finally(() => {
      // Clean up the queue entry once this is the last pending turn.
      if (queues.get(key) === next) queues.delete(key);
    })
  );

  return next;
};
