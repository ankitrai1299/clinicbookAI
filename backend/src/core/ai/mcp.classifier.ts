// The brain's intent ROUTER (injected via setIntentClassifier). Its ONLY job is
// to decide WHICH product skill a message belongs to — not to fully understand it.
//
// Deliberately lightweight (keyword, no AI): the ClinicBook booking FSM already
// runs its own AI understanding internally, so booking-family messages just fall
// through to 'unknown' → the fallback booking skill. That keeps booking parity and
// avoids a second OpenAI call per message. Only DISTINCTIVE cross-product intents
// (a patient asking for their prescription/scribe; medicine reminders later) are
// matched here and routed to the owning product's skill.

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
// "status?", "when is my appointment") — a QUERY, not a booking request. The
// query words (kab/kitne/status/when/next) are what keep this from stealing a
// "appointment chahiye / book karni hai" message, which stays booking.
const STATUS =
  /\b(status)\b|(meri|my|next|agli)\s*appointment\s*(kab|kitne|kaunsi|status|details?|confirm|hai\??$)|appointment\s*(kab|kitne baje|status|confirm hui)|kab\s*(hai\s*)?meri\s*appointment|when\s*is\s*my\s*appointment|appointment\s*kab\s*(hai|ki)/i;

// Patient wants their FULL record / history — the 360 summary (bookings +
// medicines + last visit). Broad "everything about me" ask; checked AFTER the
// specific intents so "meri parchi"/"meri report"/"appointment kab" still win.
const RECORD =
  /\b(record|history)\b|meri\s*(saari|poori|puri)\s*(jankari|history|details)|poori\s*jankari|puri\s*jankari|full\s*(record|history|details|info)|sab\s*kuch\s*(batao|dikhao|bhejo)/i;

export const mcpIntentClassifier: IntentClassifier = (
  _ctx: McpContext,
  text: string
): IntentClassification => {
  const t = (text || '').toLowerCase();
  // Order matters: the more SPECIFIC intents win before the broader ones. Both
  // NovaScribe intents (prescription/document) are checked before STATUS so a
  // "report" request never lands on appointment-status; RECORD (the "everything"
  // ask) is last so a specific request is never swallowed by it.
  if (PRESCRIPTION.test(t)) return { intent: 'prescription' };
  if (DOCUMENT.test(t)) return { intent: 'document' };
  if (STATUS.test(t)) return { intent: 'status' };
  if (RECORD.test(t)) return { intent: 'record' };
  // Everything else → fallback booking skill (the FSM understands it internally).
  return { intent: 'unknown' };
};
