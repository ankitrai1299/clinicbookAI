// Stage 4 — Verification (anti-hallucination). A SECOND, independent LLM pass
// that checks the most safety-critical output — the PRESCRIPTION — against the
// transcript. Any medicine NOT explicitly supported by the transcript is FLAGGED
// for the doctor (never silently dropped or "corrected"). Diversity of pass
// (generate vs verify) catches fabrications a single pass misses.

import { complete } from '../../../core/ai/llm.js';
import type { PrescriptionItem } from '../novascribe.types.js';

const SYSTEM = [
  'You are a strict clinical fact-checker. You are given a consultation TRANSCRIPT',
  'and a list of MEDICINES that an AI drafted from it. For EACH medicine decide',
  'whether it is explicitly supported by the transcript (the doctor actually',
  'prescribed/mentioned it).',
  'Be skeptical: if a medicine is not clearly in the transcript, mark supported=false.',
  'Return STRICT JSON: { "results": [ { "index": number, "supported": boolean } ] }',
  'where index is the 0-based position in the provided list.'
].join('\n');

/**
 * Returns the prescription with `flagged=true` on any item the verifier could
 * not confirm in the transcript. Fail-open: if verification errors, the input is
 * returned unchanged (the generation-stage flags still apply).
 */
export const verifyPrescriptionGrounding = async (
  transcript: string,
  prescription: PrescriptionItem[]
): Promise<PrescriptionItem[]> => {
  if (prescription.length === 0) {
    return prescription;
  }

  const list = prescription.map((p, i) => `${i}. ${p.drug} ${p.dose} ${p.frequency} ${p.duration}`.trim()).join('\n');

  let parsed: { results?: Array<{ index?: number; supported?: boolean }> };
  try {
    const raw = await complete({
      system: SYSTEM,
      user: `TRANSCRIPT:\n${transcript}\n\nMEDICINES:\n${list}`,
      json: true,
      temperature: 0
    });
    parsed = JSON.parse(raw) as typeof parsed;
  } catch (err) {
    console.error('[novascribe.verify] verification failed, keeping draft as-is:', err);
    return prescription;
  }

  const unsupported = new Set(
    (parsed.results ?? [])
      .filter((r) => r && r.supported === false && typeof r.index === 'number')
      .map((r) => r.index as number)
  );

  return prescription.map((item, i) =>
    unsupported.has(i) ? { ...item, flagged: true } : item
  );
};
