// Stage 2 — Medical understanding. Turns a consultation transcript into a
// structured SOAP note + prescription draft, WITH per-fact evidence (verbatim
// quotes from the transcript) for the anti-hallucination review UI.
//
// Grounding rules are baked into the prompt: leave fields empty rather than
// guess; never invent drugs/diagnoses not present in the transcript.

import { complete } from '../../../core/ai/llm.js';
import { AppError } from '../../../utils/AppError.js';
import type {
  ConsultationContext,
  EvidenceMap,
  PrescriptionItem,
  UnderstandingResult
} from '../novascribe.types.js';

const SYSTEM = [
  'You are a clinical documentation assistant helping a licensed doctor in India.',
  'Input: a (possibly Hindi/English/Hinglish/Marathi/Tamil code-mixed) doctor–patient',
  'consultation transcript. Produce a structured SOAP note and a prescription draft.',
  '',
  'Return STRICT JSON with exactly this shape:',
  '{',
  '  "subjective": string,',
  '  "objective": string,',
  '  "assessment": string,',
  '  "plan": string,',
  '  "prescription": [ { "drug": string, "dose": string, "frequency": string, "duration": string, "notes": string } ],',
  '  "evidence": { "<field>": [ { "quote": string } ] }   // short verbatim transcript spans supporting each section/medicine',
  '}',
  '',
  'HARD RULES (anti-hallucination):',
  '- Use ONLY information present in the transcript. Do NOT invent symptoms, diagnoses, drugs, doses or tests.',
  '- If something is not stated, use an empty string (or empty array). Never guess.',
  '- Prescription: only medicines actually said by the doctor. Keep the drug name as spoken.',
  '- evidence: for each non-empty section and each medicine, include at least one short verbatim quote from the transcript that supports it.',
  '- Translate clinical content to clear English in the SOAP note, but keep drug names as-is.',
  'This output is a DRAFT the doctor will review, edit and approve.'
].join('\n');

const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

const normalisePrescription = (v: unknown): PrescriptionItem[] => {
  if (!Array.isArray(v)) return [];
  return v
    .filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null)
    .map((i) => ({
      drug: asString(i.drug),
      dose: asString(i.dose),
      frequency: asString(i.frequency),
      duration: asString(i.duration),
      notes: asString(i.notes)
    }))
    .filter((i) => i.drug.length > 0);
};

const normaliseEvidence = (v: unknown): EvidenceMap => {
  if (typeof v !== 'object' || v === null) return {};
  const out: EvidenceMap = {};
  for (const [field, items] of Object.entries(v as Record<string, unknown>)) {
    if (!Array.isArray(items)) continue;
    const quotes = items
      .map((it) => (typeof it === 'object' && it !== null ? asString((it as Record<string, unknown>).quote) : asString(it)))
      .filter((q) => q.length > 0)
      .map((quote) => ({ quote }));
    if (quotes.length > 0) out[field] = quotes;
  }
  return out;
};

export const understandTranscript = async (
  transcript: string,
  context?: ConsultationContext
): Promise<UnderstandingResult> => {
  const contextLine = context
    ? `Patient context (do not contradict, do not invent beyond this): ${JSON.stringify(context)}\n\n`
    : '';

  const raw = await complete({
    system: SYSTEM,
    user: `${contextLine}Consultation transcript:\n${transcript}`,
    json: true,
    temperature: 0.1
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new AppError('AI returned a malformed draft. Please try again.', 502);
  }

  return {
    sections: {
      subjective: asString(parsed.subjective),
      objective: asString(parsed.objective),
      assessment: asString(parsed.assessment),
      plan: asString(parsed.plan)
    },
    prescription: normalisePrescription(parsed.prescription),
    evidence: normaliseEvidence(parsed.evidence)
  };
};
