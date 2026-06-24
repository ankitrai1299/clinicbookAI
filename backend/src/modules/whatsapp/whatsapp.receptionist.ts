// ===========================================================================
// AI Receptionist layer — the ONLY place natural language is interpreted.
//
//   Patient text → understand() → { intent, speciality, doctor, date, … } → FSM
//
// This layer ONLY understands. It never books, cancels, reschedules or picks a
// slot — it returns a structured `Understanding` and the deterministic FSM
// (whatsapp.booking.ts) decides what to do and performs every DB action.
//
// Two modes, chosen by the WA_AI_RECEPTIONIST flag:
//   • AI on (+ OPENAI_API_KEY): LLM understanding (intent, speciality, doctor,
//     date phrase, confidence, FAQ) via understandPatientMessage. The date is
//     re-resolved DETERMINISTICALLY here (the model only hints) so a hallucinated
//     date can never reach the booking engine.
//   • AI off / no key / LLM error: the deterministic keyword classifier
//     (classifyIntent). In this mode understand() returns exactly what the old
//     FSM saw (no date/doctor/FAQ/handoff extras) so behaviour is unchanged.
// ===========================================================================

import { env } from '../../config/env.js';
import { classifyIntent } from './whatsapp.intent.js';
import { understandPatientMessage } from '../ai/ai.service.js';

export type ReceptionistIntent =
  | 'book'
  | 'cancel'
  | 'reschedule'
  | 'check'
  | 'availability'
  | 'menu'
  | 'unknown';

export interface Understanding {
  intent: ReceptionistIntent;
  speciality: string | null;
  doctorName: string | null;
  preferredDate: string | null; // resolved YYYY-MM-DD, or null
  confidence: number; // 0..1
  faqAnswer: string | null; // short answer for a generic clinic question, else null
  wantsHuman: boolean; // patient asked for a person, or clinic-data FAQ we can't answer
  source: 'ai' | 'deterministic';
}

// AI understanding is active only when the flag is on AND a key is present.
export const aiReceptionistEnabled = (): boolean => env.WA_AI_RECEPTIONIST && Boolean(env.OPENAI_API_KEY);

export const confidenceMin = (): number => env.WA_AI_CONFIDENCE_MIN;

// --- Deterministic date-phrase → YYYY-MM-DD (UTC, matches slot dates) -------
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAY_ABBR = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const toISO = (d: Date): string => d.toISOString().slice(0, 10);
const todayUTC = (): Date => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
};
const addDays = (d: Date, n: number): Date => {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
};

// Resolve a free-text date phrase to a concrete upcoming date, or null. Only
// recognises clear, unambiguous phrases — anything else returns null and the FSM
// falls back to its normal "next available" scan.
export const parsePreferredDate = (text: string): string | null => {
  const t = text.toLowerCase();
  const base = todayUTC();

  // Explicit ISO date.
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(t);
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00.000Z`);
    if (!Number.isNaN(d.getTime()) && d >= base) return toISO(d);
  }

  // Latin + Devanagari variants — Whisper may transcribe Hindi voice notes in
  // either script, so both must resolve (आज=today, परसों=day-after, कल=tomorrow).
  if (/\b(today|aaj|abhi)\b/.test(t) || /(आज|अभी)/.test(t)) return toISO(base);
  if (/\b(day after tomorrow|parso|parson)\b/.test(t) || /(परसों|परसो)/.test(t)) return toISO(addDays(base, 2));
  // "kal" (Hindi) colloquially = tomorrow in a booking context.
  if (/\b(tomorrow|tmrw|tmrrw|kal)\b/.test(t) || /(कल)/.test(t)) return toISO(addDays(base, 1));

  // Weekday name → the next occurrence on/after today.
  for (let i = 0; i < 7; i += 1) {
    const re = new RegExp(`\\b(${WEEKDAYS[i]}|${WEEKDAY_ABBR[i]})\\b`);
    if (re.test(t)) {
      const delta = (i - base.getUTCDay() + 7) % 7; // 0..6, today if it matches
      return toISO(addDays(base, delta));
    }
  }

  // "12 jun" / "12 june" (day-then-month) or "jun 12" / "june 12" (month-then-day).
  const dayFirst = /\b(\d{1,2})\s*(?:st|nd|rd|th)?\s+([a-z]{3,9})\b/.exec(t);
  const monthFirst = /\b([a-z]{3,9})\s+(\d{1,2})\b/.exec(t);
  const dayStr = dayFirst?.[1] ?? monthFirst?.[2];
  const monStr = dayFirst?.[2] ?? monthFirst?.[1];
  if (dayStr && monStr) {
    const day = parseInt(dayStr, 10);
    const mon = MONTHS.findIndex((m) => monStr.startsWith(m));
    if (mon >= 0 && day >= 1 && day <= 31) {
      let cand = new Date(Date.UTC(base.getUTCFullYear(), mon, day));
      if (cand < base) cand = new Date(Date.UTC(base.getUTCFullYear() + 1, mon, day));
      if (!Number.isNaN(cand.getTime())) return toISO(cand);
    }
  }

  return null;
};

const HUMAN_RE = /\b(human|staff|agent|receptionist|representative|real person|talk to (someone|a person)|call me)\b/i;

// Deterministic match of a known doctor in the text — by full name or by any
// name token (first name / surname) of 3+ chars appearing as a whole word.
export const matchDoctorName = (text: string, doctorNames: string[]): string | null => {
  const t = text.toLowerCase();
  for (const name of doctorNames) {
    const bare = name.toLowerCase().replace(/^dr\.?\s*/, '');
    if (t.includes(bare)) return name;
    const tokens = bare.split(/\s+/).filter((w) => w.length >= 3);
    if (tokens.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t))) {
      return name;
    }
  }
  return null;
};

// --- The single entry point the FSM calls ---------------------------------
export const understand = async (params: {
  message: string;
  specialities: string[];
  doctorNames: string[];
  // Force AI understanding for THIS message even when WA_AI_RECEPTIONIST is off.
  // Set for voice notes (free-form speech that the keyword classifier can't read).
  forceAi?: boolean;
}): Promise<Understanding> => {
  // Deterministic mode: return EXACTLY what the legacy FSM saw — intent +
  // speciality only, no date/doctor/FAQ/handoff extras — so flag-off behaviour
  // is byte-for-byte unchanged.
  const deterministic = (): Understanding => {
    const { intent, speciality } = classifyIntent(params.message, params.specialities);
    const mapped: ReceptionistIntent = intent === 'menu' ? 'menu' : (intent as ReceptionistIntent);
    return {
      intent: mapped,
      speciality,
      doctorName: null,
      preferredDate: null,
      confidence: intent === 'unknown' ? 0 : intent === 'book' && !speciality ? 0.7 : 1,
      faqAnswer: null,
      wantsHuman: false,
      source: 'deterministic'
    };
  };

  // Voice notes force AI understanding (key permitting); typed text follows the
  // global WA_AI_RECEPTIONIST flag.
  const useAi = aiReceptionistEnabled() || (Boolean(params.forceAi) && Boolean(env.OPENAI_API_KEY));
  if (!useAi) return deterministic();

  const ai = await understandPatientMessage(params.message, params.specialities, params.doctorNames);
  if (!ai) return deterministic();

  // Date is authoritative from OUR parser (model only hinted dateText).
  const preferredDate =
    parsePreferredDate(params.message) ?? (ai.dateText ? parsePreferredDate(ai.dateText) : null);

  // Re-validate doctor against the DB list (model value already checked, but the
  // deterministic matcher also catches surnames the model missed).
  const doctorName = ai.doctorName ?? matchDoctorName(params.message, params.doctorNames);

  const wantsHuman = ai.intent === 'human' || HUMAN_RE.test(params.message);

  // Map the richer AI intent set onto the FSM-routable set.
  let intent: ReceptionistIntent;
  switch (ai.intent) {
    case 'book':
    case 'cancel':
    case 'reschedule':
    case 'check':
    case 'availability':
    case 'menu':
      intent = ai.intent;
      break;
    default:
      // 'faq' / 'human' / 'unknown' don't map to a booking branch; the FSM reads
      // faqAnswer / wantsHuman / confidence to decide.
      intent = 'unknown';
  }

  return {
    intent,
    speciality: ai.speciality,
    doctorName,
    preferredDate,
    confidence: ai.confidence,
    faqAnswer: ai.faqAnswer,
    wantsHuman,
    source: 'ai'
  };
};
