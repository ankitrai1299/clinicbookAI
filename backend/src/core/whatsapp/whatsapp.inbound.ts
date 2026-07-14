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
import { dataSourceFor } from '../datasource/index.js';
import { env } from '../../config/env.js';
import { isWhatsAppConfigured } from '../../config/whatsapp.js';
import { handleWhatsAppMessage } from './whatsapp.booking.js';
import { resolveClinicIdByPhoneNumberId } from './whatsapp.channel.js';
import { resolveSharedClinic } from './whatsapp.binding.js';
import { isBrainEnabledFor, runConversation } from '../mcp/index.js';
import type { McpContext } from '../mcp/index.js';
import {
  logInboundMessage,
  recordInboundMessage,
  sendWhatsAppInteractive,
  sendWhatsAppTextMessage
} from './whatsapp.service.js';
import { type BotReply, botReplyText } from './whatsapp.reply.js';
import { recordOutbound } from './whatsapp.diagnostics.js';
import {
  detectLang,
  storedLangToCode,
  codeToLangName,
  isTranslateEnabledFor,
  translateReply
} from './whatsapp.language.js';
import { translateText } from '../ai/translate.js';

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
// The resolved clinic PLUS, when a join code just (re)connected the patient on the
// shared number, that clinic's name — so the caller can confirm WHICH clinic they
// were switched to. A single phone can be registered with many clinics; the binding
// is the ACTIVE one, and sending another clinic's code switches to it (their data in
// every other clinic stays intact and separate).
type InboundClinic = { clinicId: string | null; joinedClinicName?: string };
let cachedFallbackClinicId: string | null = null;
const resolveInboundClinicId = async (
  phoneNumberId?: string | null,
  phone?: string | null,
  text?: string | null
): Promise<InboundClinic> => {
  const byChannel = await resolveClinicIdByPhoneNumberId(phoneNumberId);

  // SHARED PLATFORM NUMBER multi-tenancy: the shared number resolves (by channel)
  // to the platform/default clinic. On that number, a patient who sent a join code
  // or is already bound is routed to THEIR clinic instead; everyone else stays on
  // the platform clinic. A clinic's OWN connected number is unaffected. All data
  // stays clinic-scoped, so clinics never mix.
  const isPlatformChannel = !!(env.WHATSAPP_CLINIC_ID && byChannel === env.WHATSAPP_CLINIC_ID);
  const onSharedNumber = !byChannel || isPlatformChannel;
  if (onSharedNumber && phone) {
    const shared = await resolveSharedClinic(phone, text || '');
    if (shared.clinicId) return { clinicId: shared.clinicId, joinedClinicName: shared.justBoundName };
    // On the SHARED platform number an unidentified patient must NEVER fall through
    // to the platform clinic's booking — that would show ITS doctors to another
    // clinic's patient (the exact cross-clinic leak we're preventing). Return null
    // so the caller asks them for their clinic code instead.
    if (isPlatformChannel) return { clinicId: null };
  }

  // A clinic's OWN connected number (not the shared platform number) — route to it.
  if (byChannel && !isPlatformChannel) return { clinicId: byChannel };

  if (env.NODE_ENV === 'production') {
    console.error(
      '[WhatsApp] No clinic for inbound phone_number_id — create a WhatsAppChannel for this number (or set WHATSAPP_CLINIC_ID for the env default).',
      { phoneNumberId: phoneNumberId ?? null }
    );
    return { clinicId: null };
  }

  if (cachedFallbackClinicId) return { clinicId: cachedFallbackClinicId };
  const clinic = await prisma.clinic.findFirst({
    where: { email: { not: PLATFORM_CLINIC_EMAIL } },
    orderBy: { doctors: { _count: 'desc' } },
    select: { id: true }
  });
  cachedFallbackClinicId = clinic?.id ?? null;
  return { clinicId: cachedFallbackClinicId };
};

// Find the patient for this number WITHIN the bound clinic, or onboard them.
// First inbound from an unknown number auto-creates a patient (a real, bookable
// resource) so the booking agent can act immediately — no /register step, no loop.
const findOrCreatePatient = async (clinicId: string, phone: string) => {
  const patients = dataSourceFor(clinicId).patients;
  const national = nationalKey(phone);

  console.info('[WhatsApp][resolve] lookup', { inboundPhone: phone, nationalKey: national, clinicId });

  if (national) {
    // Fast path: substring match on the contiguous national digits.
    const candidates = await patients.findByPhoneContains(national);
    let found = candidates.find((p) => nationalKey(p.phone || '') === national);

    // Robust fallback: a number stored WITH formatting (e.g. "+91 98765 43210")
    // has a space inside it, so the contiguous national digits won't substring-
    // match and the fast path misses it. Rather than create a DUPLICATE patient
    // for the same human, scan the clinic's patients and compare on normalized
    // national keys. This is what makes resolution work for EVERY number format,
    // not just clean digit strings.
    if (!found) {
      const all = await patients.listRecent();
      found = all.find((p) => nationalKey(p.phone || '') === national);
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
  const created = await patients.onboard({
    name: `WhatsApp Patient ${digits.slice(-4)}`,
    phone: digits,
    language: 'English',
    source: 'whatsapp'
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
  // Language to reply in ('en' = unchanged behaviour). Set by the multilingual
  // gate below from the script the patient wrote in (or their stored language).
  let replyLang = 'en';

  try {
    const resolved = await resolveInboundClinicId(phoneNumberId, to, text);
    clinicId = resolved.clinicId;
    await logInboundMessage({ from: to, body: text, waMessageId: inboundWamid, clinicId }).catch(() => undefined);
    // Refresh the 24h WhatsApp session window (per clinic) on every processed
    // inbound, keyed on the same digits-only number the send path checks. Uses
    // server time so it can't be left stale by a missing/old Meta timestamp. Only
    // once the clinic is known — the window is per (clinicId, phone).
    if (clinicId) await recordInboundMessage(clinicId, to).catch(() => undefined);

    if (clinicId) {
      const patient = await findOrCreatePatient(clinicId, from);
      patientCode = patient.patientCode;

      // MULTILINGUAL (gated, strangler-fig): reply in whatever language the patient
      // wrote in. Detect the script of a free-text message; translate it INTO
      // English so the FSM/brain understand it unchanged; remember the language so
      // later button-tap turns (which carry no text) still reply in it. Gate is OFF
      // by default (WHATSAPP_TRANSLATE_NUMBERS) → production byte-for-byte unchanged.
      if (isTranslateEnabledFor(to)) {
        const detected = text && !interactiveId ? detectLang(text) : 'en';
        if (detected !== 'en') {
          replyLang = detected;
          if (detected !== storedLangToCode(patient.language)) {
            prisma.patient
              .update({ where: { id: patient.id }, data: { language: codeToLangName(detected) } })
              .catch(() => undefined);
          }
          text = await translateText(text, 'en', detected);
        } else if (interactiveId || !text) {
          // No text to detect (button/list tap) → use the patient's stored language.
          replyLang = storedLangToCode(patient.language);
        }
      }

      // ROLLOUT (strangler-fig): opted-in senders route through the Healthcare MCP
      // brain (understand → route → skill); everyone else takes the unchanged FSM
      // path directly. Gate defaults OFF, so production is byte-for-byte unchanged
      // until a number is explicitly enabled via MCP_BRAIN_NUMBERS. In slice 1 the
      // brain's fallback skill delegates to this SAME FSM, so the reply is
      // identical while the pipeline is exercised end-to-end.
      let botReply: BotReply | null;
      if (resolved.joinedClinicName) {
        // A join code just (re)connected this patient to a clinic on the SHARED
        // number. Confirm WHICH clinic — so a patient registered with several always
        // knows who they're talking to — and show the menu. We do NOT feed the raw
        // code to the booking brain (it isn't a command), and their data in every
        // other clinic they joined stays untouched; sending that clinic's code
        // switches back to it.
        botReply =
          `✅ You're now connected to *${resolved.joinedClinicName}*.\n\n` +
          `How can I help you today?\n\n` +
          `1. Book Appointment\n2. My Appointments\n3. Cancel Appointment\n4. Reschedule Appointment\n\n` +
          `Reply with a number (1-4).`;
      } else if (isBrainEnabledFor(to)) {
        const ctx: McpContext = {
          clinicId,
          channel: 'whatsapp',
          actor: { kind: 'patient', patientId: patient.id, externalId: to, displayName: patient.name },
          meta: {
            phone: to,
            patientName: patient.name,
            clinicName: patient.clinic?.name ?? 'our clinic',
            patientCode: patient.patientCode,
            replyId: interactiveId,
            fromVoice
          }
        };
        const result = await runConversation(ctx, text);
        botReply = result.reply as BotReply | null;
      } else {
        // Deterministic booking state machine owns the ENTIRE conversation. No AI
        // controls flow, picks doctors, or books — every reply is FSM-generated.
        botReply = await handleWhatsAppMessage({
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
      }
      // null = stay silent. A plain string is trimmed (empty → safe fallback);
      // an interactive reply is passed through untouched.
      reply =
        botReply === null
          ? null
          : typeof botReply === 'string'
            ? botReply.trim() || SAFE_FALLBACK
            : botReply;
    } else {
      // No clinic bound → this is the SHARED platform number and we couldn't
      // identify the patient's clinic (no join code, no binding, not an existing
      // patient). Ask for the clinic code instead of guessing — this is what keeps
      // clinics separate. Never fall back to the platform clinic or an AI responder.
      console.warn('[WhatsApp] Unidentified patient on shared number — asking for clinic code.');
      reply =
        "👋 Welcome! To connect you to your clinic, please reply with your clinic's code " +
        '(for example: US2QNF). You\'ll find it on your clinic\'s WhatsApp QR poster or link.';
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

  // MULTILINGUAL (gated): translate the outgoing reply into the patient's language
  // before it's recorded/sent. IDs on interactive options are preserved so taps
  // still route correctly; on any failure the original English text is kept.
  if (replyLang !== 'en' && reply !== null) {
    reply = await translateReply(reply, replyLang);
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
