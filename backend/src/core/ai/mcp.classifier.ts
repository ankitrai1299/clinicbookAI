// The brain's intent ROUTER (injected via setIntentClassifier). Its ONLY job is
// to decide WHICH product skill a message belongs to — not to fully understand it.
//
// TWO-STAGE: a cheap keyword fast-path first (no LLM cost for the common cases),
// then an AI fallback so the "100 patients say it 100 ways" long tail still routes
// correctly. Booking-family messages return 'unknown' → the booking FSM, which
// runs its OWN AI understanding, so we don't route a booking to a wrong skill and
// we avoid a needless second LLM call for obvious booking phrasings.

import { complete, isAiConfigured } from './llm.js';
import type { IntentClassification, IntentClassifier, McpContext } from '../mcp/index.js';

// NovaScribe: patient wants their prescription / doctor's notes / scribe. Kept
// specific so it never steals a booking message ("book", "appointment", a date…).
const PRESCRIPTION =
  /\b(prescription|nuskha|parchi|scribe)\b|dawai(yon|yan)?\s*(ki\s*)?(list|likhi|kaunsi|kya|batao)|doctor\s*(ne)?\s*(kya)?\s*likh|medicine[s]?\s*(list|likhi|details?)|soap\s*note|meri\s*(dawai|medicine|parchi)/i;

// NovaScribe: patient wants their report / document / consultation summary (the
// doctor's clinical NOTE, distinct from the medicine list above).
const DOCUMENT =
  /\b(report|reports|document|documents|summary)\b|meri\s*report|test\s*result|lab\s*(report|result)|blood\s*report|consultation\s*(note|summary)|visit\s*summary/i;

// ClinicBook: patient is ASKING ABOUT an existing appointment ("kab hai?",
// "status?", "when is my appointment") — a QUERY, not a booking request.
const STATUS =
  /\b(status)\b|(meri|my|next|agli)\s*appointment\s*(kab|kitne|kaunsi|status|details?|confirm|hai\??$)|appointment\s*(kab|kitne baje|status|confirm hui)|kab\s*(hai\s*)?meri\s*appointment|when\s*is\s*my\s*appointment|appointment\s*kab\s*(hai|ki)/i;

// Patient wants their FULL record / history — the 360 summary.
const RECORD =
  /\b(records?|history)\b|(give|send|show)\s*(me\s*)?(my\s*)?(records?|history|details|full\s*detail)|meri\s*(saari|poori|puri)\s*(jankari|history|details)|poori\s*jankari|puri\s*jankari|full\s*(record|records|history|details|info)|sab\s*kuch\s*(batao|dikhao|bhejo)/i;

// Obvious booking/scheduling signals → skip the AI classifier and go straight to
// the FSM (it understands booking itself), so a booking never pays for two LLM calls.
const BOOKING_HINT =
  /\b(book|booking|appointment|appoint|slot|milna|dikhana|dikhna|consult|checkup|reschedule|cancel|waitlist)\b|\bdoctor\s*se\b|\b(kal|aaj|parso|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|somvar|mangalvar)\b|\d{1,2}\s*(am|pm|baje)|\d{1,2}[:/]\d{2}/i;

const AI_SYSTEM =
  `You classify a patient's WhatsApp message to a clinic into ONE intent:\n` +
  `- "prescription": they want their prescribed medicines / dawai / parchi.\n` +
  `- "document": they want their medical report / consultation summary / document.\n` +
  `- "status": they are asking ABOUT an existing appointment (when is it / details / is it confirmed).\n` +
  `- "record": they want their FULL record / history / everything about them.\n` +
  `- "other": anything else — booking/cancelling/rescheduling an appointment, greetings, or unclear.\n` +
  `Reply ONLY with a JSON object like {"intent":"prescription"}.`;

const AI_INTENTS = new Set(['prescription', 'document', 'status', 'record']);

export const mcpIntentClassifier: IntentClassifier = async (
  _ctx: McpContext,
  text: string
): Promise<IntentClassification> => {
  const t = (text || '').toLowerCase();

  // 1) Keyword fast-path — obvious skill requests, no LLM cost.
  if (PRESCRIPTION.test(t)) return { intent: 'prescription' };
  if (DOCUMENT.test(t)) return { intent: 'document' };
  if (STATUS.test(t)) return { intent: 'status' };
  if (RECORD.test(t)) return { intent: 'record' };

  // Obvious booking-family → straight to the FSM (avoids a wasted LLM call).
  if (BOOKING_HINT.test(t)) return { intent: 'unknown' };

  // 2) AI fallback — understand the long-tail phrasings the keywords miss.
  if (isAiConfigured() && (text || '').trim().length > 2) {
    try {
      const raw = await complete({
        system: AI_SYSTEM,
        user: (text || '').slice(0, 500),
        json: true,
        temperature: 0
      });
      const intent = String(JSON.parse(raw)?.intent || '').toLowerCase();
      if (AI_INTENTS.has(intent)) return { intent };
    } catch {
      /* fall through to unknown → booking FSM */
    }
  }

  // Everything else → fallback booking skill (the FSM understands it internally).
  return { intent: 'unknown' };
};
