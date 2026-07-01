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

export const mcpIntentClassifier: IntentClassifier = (
  _ctx: McpContext,
  text: string
): IntentClassification => {
  const t = (text || '').toLowerCase();
  if (PRESCRIPTION.test(t)) return { intent: 'prescription' };
  // Everything else → fallback booking skill (the FSM understands it internally).
  return { intent: 'unknown' };
};
