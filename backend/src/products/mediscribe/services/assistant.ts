// Answer a doctor's spoken question about their own patients.
//
// Strictly READ-ONLY. Nothing here writes, sends, books or deletes — a misheard
// word costs a re-ask, never a wrong prescription reaching a patient's phone.
//
// Pipeline: classify the question (keywords, then the model only if needed) →
// resolve which patient it is about → fetch real records → template the answer.
// The model never writes prose; see assistant.answer.ts for why.

import { buildPatientHistory } from './patientHistory.js';
import { listClinicPatients, type ScribePatient } from '../clinicData.js';
import { consultationsRepo } from '../repositories/index.js';
import { sarvamChat } from './sarvam.js';
import {
  parseQuestionLocally,
  CLASSIFIER_PROMPT,
  MODEL_INTENTS,
  type AskIntent,
  type ParsedQuestion,
} from './assistant.intent.js';
import { buildAnswer, type Answer } from './assistant.answer.js';

export interface AskResult {
  answer: string;
  intent: AskIntent;
  /** The patient the answer is about, when it is about one. */
  patient?: { id: string; name: string };
  /** Several patients matched the spoken name — the caller must disambiguate. */
  choices?: { id: string; name: string; phone?: string }[];
  visitDate?: string;
  /** True when the answer reports missing data rather than a finding. */
  isAbsence?: boolean;
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Match a spoken name against the doctor's patients.
 *
 * Speech recognition mangles Indian names often enough that an exact match alone
 * would make this feel broken, so we widen: exact → starts-with → any word in
 * common. Everything that matches is returned, because guessing between two
 * patients called Priya is exactly the mistake worth avoiding — the caller asks.
 */
export function matchPatients(patients: ScribePatient[], spokenName: string): ScribePatient[] {
  const q = norm(spokenName);
  if (!q) return [];

  const exact = patients.filter((p) => norm(p.name) === q);
  if (exact.length) return exact;

  // Only the SPOKEN name may be the longer string. The reverse ("Ram" on file
  // swallowing a spoken "Ramesh") confidently answered about the wrong patient —
  // exactly the mistake this matcher exists to avoid — so it is gone.
  const prefix = patients.filter((p) => norm(p.name).startsWith(q));
  if (prefix.length) return prefix;

  // Whole-word overlap, so "Priya" matches "Priya Sharma" but a stray fragment
  // can't. Word must be ≥3 chars and match a full name part (not a prefix of one).
  const words = q.split(' ').filter((w) => w.length > 2);
  if (!words.length) return [];
  return patients.filter((p) => {
    const parts = norm(p.name).split(' ');
    return words.some((w) => parts.includes(w));
  });
}

/** Ask the model to classify, accepting ONLY a known label. */
async function classifyWithModel(question: string): Promise<AskIntent> {
  try {
    const raw = await sarvamChat(
      [
        { role: 'system', content: CLASSIFIER_PROMPT },
        { role: 'user', content: question },
      ],
      // `disableThinking` is essential, not optional: with the reasoning trace on,
      // it shares this token budget and — at 24 tokens — consumes all of it, so
      // sarvamChat returns empty and throws, making this whole fallback silently
      // dead. A single label needs no thinking.
      { maxTokens: 24, disableThinking: true },
    );
    const label = String(raw || '').trim().toLowerCase().replace(/[^a-z_]/g, '');
    return (MODEL_INTENTS as string[]).includes(label) ? (label as AskIntent) : 'unknown';
  } catch {
    // The assistant degrading to "I didn't catch that" is fine; failing the
    // request because a classifier was unreachable is not.
    return 'unknown';
  }
}

/**
 * @param doctorId    the asking doctor — scopes every lookup to their patients
 * @param patientId   the patient already on screen, if any. Takes priority over a
 *                    name in the question: what the doctor is looking at is a far
 *                    stronger signal than what speech recognition heard.
 */
export async function askAssistant(opts: {
  clinicId: string;
  doctorId: string;
  isDoctor: boolean;
  question: string;
  patientId?: string;
}): Promise<AskResult> {
  const { clinicId, doctorId, isDoctor, question, patientId } = opts;

  let parsed: ParsedQuestion = parseQuestionLocally(question);
  if (parsed.intent === 'unknown') {
    const modelIntent = await classifyWithModel(question);
    if (modelIntent !== 'unknown') parsed = { ...parsed, intent: modelIntent };
  }

  // Questions that aren't about a patient.
  if (parsed.intent === 'unsupported') {
    return { answer: buildAnswer({ ...parsed, patientName: '', visits: [] }).text, intent: parsed.intent };
  }

  if (parsed.intent === 'my_drafts') {
    const all = (await consultationsRepo.findAll()) as Array<{ status?: string; doctorId?: string }>;
    const mine = isDoctor ? all.filter((c) => c.doctorId === doctorId) : all;
    const draftCount = mine.filter((c) => c.status !== 'Completed').length;
    const a = buildAnswer({ intent: 'my_drafts', patientName: '', visits: [], draftCount });
    return { answer: a.text, intent: parsed.intent };
  }

  // Everything else needs to know WHICH patient.
  const all = await listClinicPatients(clinicId);
  // A doctor may only ask about patients they have consulted.
  const visible = isDoctor ? await scopeToDoctor(all, doctorId) : all;

  let patient: ScribePatient | undefined;

  if (patientId) {
    patient = visible.find((p) => p.id === patientId);
  } else if (parsed.patientName) {
    const matches = matchPatients(visible, parsed.patientName);
    if (matches.length === 1) {
      patient = matches[0];
    } else if (matches.length > 1) {
      return {
        answer: `I found ${matches.length} patients matching "${parsed.patientName}". Which one?`,
        intent: parsed.intent,
        choices: matches.slice(0, 5).map((p) => ({ id: p.id, name: p.name, phone: p.phone })),
      };
    } else {
      return {
        answer: `I couldn't find a patient called "${parsed.patientName}" in your records.`,
        intent: parsed.intent,
        isAbsence: true,
      };
    }
  }

  if (!patient) {
    return {
      answer:
        parsed.intent === 'unknown'
          ? "I didn't catch that. Try asking about a patient's last visit, prescription, diagnosis, allergies, or current medicines."
          : 'Which patient? Open the patient, or say their name in the question.',
      intent: parsed.intent,
      isAbsence: true,
    };
  }

  // A doctor only ever gets answers from THEIR OWN consultations, even for a
  // patient a colleague also saw. Admins (who legitimately see everything) get
  // the full record. This mirrors the scoping the Sessions/Reports lists apply.
  const visits = await buildPatientHistory(patient.id, 'desc', isDoctor ? { doctorId } : {});
  const a: Answer = buildAnswer({
    intent: parsed.intent,
    patientName: patient.name,
    visits,
  });

  return {
    answer: a.text,
    intent: parsed.intent,
    patient: { id: patient.id, name: patient.name },
    visitDate: a.visitDate,
    isAbsence: a.isAbsence,
  };
}

/** The patients this doctor has actually consulted. */
async function scopeToDoctor(all: ScribePatient[], doctorId: string): Promise<ScribePatient[]> {
  const cons = (await consultationsRepo.findAll()) as Array<{ patientId?: string; doctorId?: string }>;
  const mine = new Set(
    cons.filter((c) => c.doctorId === doctorId).map((c) => c.patientId).filter(Boolean) as string[],
  );
  return all.filter((p) => mine.has(p.id));
}
