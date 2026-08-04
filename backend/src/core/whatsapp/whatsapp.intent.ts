// ===========================================================================
// Deterministic intent + speciality classifier for the WhatsApp booking FSM.
//
// NO AI / NO OpenAI: this is pure string matching. The booking flow
// (whatsapp.booking.ts) is a finite state machine and must be 100% deterministic
// — it never calls the OpenAI agent (patientAgentReply) and therefore never
// creates AiConversation / AiMessage rows. This module is the ONLY message
// understanding the FSM uses: it maps free text to a booking intent and, when
// present, to one of the clinic's REAL specialities (never invented).
//
// (Previously the FSM imported classifyPatientMessage from ai.service.ts, which
// could spend an OpenAI call. That import is removed; this synchronous, offline
// classifier replaces it so inbound booking touches OpenAI zero times.)
// ===========================================================================

export type PatientIntent =
  | 'book'
  | 'cancel'
  | 'reschedule'
  | 'check'
  | 'prescription'
  | 'menu'
  | 'unknown';

export interface PatientMessageClassification {
  intent: PatientIntent;
  // Exactly one of `specialities` (case-insensitive) or null. Never invented.
  speciality: string | null;
}

export const classifyIntent = (message: string, specialities: string[]): PatientMessageClassification => {
  const t = message.toLowerCase();

  const speciality =
    specialities.find((s) => t.includes(s.toLowerCase())) ??
    // common shorthands → speciality substring
    (/(heart|cardio)/.test(t) ? specialities.find((s) => /cardio/i.test(s)) : undefined) ??
    (/(skin|derma)/.test(t) ? specialities.find((s) => /derma/i.test(s)) : undefined) ??
    (/(child|kid|paedia|pedia)/.test(t) ? specialities.find((s) => /p(a)?edia/i.test(s)) : undefined) ??
    (/(bone|ortho)/.test(t) ? specialities.find((s) => /ortho/i.test(s)) : undefined) ??
    null;

  let intent: PatientIntent = 'unknown';
  if (/\b(cancel|delete|remove)\b/.test(t)) intent = 'cancel';
  // NOTE the deliberate absence of a trailing \b on the stems. The previous
  // pattern ended the whole alternation with \b, which required a word boundary
  // straight after "reschedul" — impossible, since the very next letter is "e".
  // So "reschedule my appointment" never matched here and fell through to the
  // rule below, where the word "appointment" starts a BRAND NEW booking. Same
  // for "change my appointment" and "move my appointment". Stems now match their
  // whole word family (reschedule/rescheduling/rescheduled, postpone/postponing).
  else if (
    /\b(reschedul|postpon|prepon)/.test(t) ||
    /\b(change|move|shift)\b.*\b(time|date|slot|appoint)/.test(t)
  ) {
    intent = 'reschedule';
  }
  // BEFORE 'book' on purpose. Asking for a prescription usually names the doctor
  // ("doctor ne kya likha hai", "doctor ki parchi"), and the booking rule matches
  // the bare word "doctor" — so ordered after it, a patient asking for their
  // medicines was dropped into a booking flow instead.
  else if (
    /\b(prescription|parchi|parcha|nuskha|medicine|medicines|dawa|dawai|dava|davai|goli|tablet)\b/.test(t) ||
    /doctor\s*(ne|ni)?\s*(kya|kia|what)\b/.test(t) ||
    /\bwhat\b.*\bprescrib/.test(t)
  ) {
    intent = 'prescription';
  } else if (/\b(book|appointment|schedule|consult|see a|meet|doctor|appt)\b/.test(t) || speciality) intent = 'book';
  else if (/\b(my appointment|status|when is|upcoming|check|view|show)\b/.test(t)) intent = 'check';
  else if (/^\s*(hi+|hey+|hello+|menu|start|help|options?|namaste|hola)\b/.test(t)) intent = 'menu';

  return { intent, speciality: speciality ?? null };
};
