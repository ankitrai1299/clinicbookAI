// Corrects medical terms that Sarvam STT mis-hears by pronunciation, using two
// sources:
//   • MEDICAL_TERMS  — a small, CURATED list of everyday drugs/diagnoses/tests
//                      (data/medicalTerms.ts). Drives BOTH the report-AI glossary
//                      and correction (edit-distance up to 2 → catches common typos).
//   • MASTER_TERMS   — ~5k single-word generic-drug names extracted from the
//                      client's MasterMedicalTerms PDFs (data/medicalTermsMaster.ts).
//                      Correction ONLY, and only at edit-distance 1 (tested to make
//                      zero false-corrections on ordinary words) → adds rare-drug
//                      coverage without touching normal language.

import { MEDICAL_TERMS } from '../data/medicalTerms.js';
import { MASTER_TERMS } from '../data/medicalTermsMaster.js';

// Curated canonical terms (de-duplicated).
const CURATED = [...new Set(MEDICAL_TERMS.map(t => t.trim()).filter(Boolean))];

// Curated single-words (length >= 5) lower-case → canonical.
const CURATED_WORDS = new Map<string, string>();
for (const term of CURATED) {
  for (const w of term.split(/\s+/)) {
    const key = w.toLowerCase().replace(/[^a-z0-9]/gi, '');
    if (key.length >= 5 && !CURATED_WORDS.has(key)) CURATED_WORDS.set(key, w);
  }
}

// Master words bucketed by first letter for fast lookup (5k+ terms).
const MASTER_BY_FIRST = new Map<string, Array<[string, string]>>();
for (const raw of MASTER_TERMS) {
  const disp = raw.trim();
  const key = disp.toLowerCase();
  if (key.length < 6) continue;
  const bucket = key[0];
  if (!MASTER_BY_FIRST.has(bucket)) MASTER_BY_FIRST.set(bucket, []);
  MASTER_BY_FIRST.get(bucket)!.push([key, disp]);
}
const CURATED_KEYS = [...CURATED_WORDS.keys()];

/** The CURATED glossary as a compact string for the report-generation prompt.
 *  (The 5k master list is deliberately NOT sent to the AI — too large for the prompt.) */
export function glossaryForPrompt(): string {
  return CURATED.join(', ');
}

// Levenshtein edit distance with early-exit once it exceeds `max`.
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

function bestIn(pairs: Array<[string, string]>, key: string, budget: number): string | null {
  let best: string | null = null;
  let bestDist = budget + 1;
  for (const [cand, disp] of pairs) {
    if (Math.abs(cand.length - key.length) > budget) continue;
    const d = editDistance(key, cand, budget);
    if (d <= budget && d < bestDist) {
      bestDist = d;
      best = disp;
      if (d === 1) break;
    }
  }
  return best;
}

// Closest known term for a token, or null. Curated first (distance 1, or 2 for long
// words), then the master list (distance 1 only — proven zero false positives).
function closestTerm(token: string): string | null {
  const key = token.toLowerCase();
  if (CURATED_WORDS.has(key)) return null; // already a correct curated term
  const curatedBudget = key.length >= 9 ? 2 : 1;
  const curated = bestIn(
    CURATED_KEYS.map(k => [k, CURATED_WORDS.get(k)!] as [string, string]),
    key,
    curatedBudget,
  );
  if (curated) return curated;
  const bucket = MASTER_BY_FIRST.get(key[0]);
  return bucket ? bestIn(bucket, key, 1) : null;
}

/**
 * Conservatively correct mis-transcribed medical terms in free text. Only alphabetic
 * tokens (length >= 6) that are a near-miss of a known term are replaced; everything
 * else is left exactly as written.
 */
export function correctMedicalTerms(text: string): string {
  if (!text) return text;
  return text.replace(/[A-Za-z][A-Za-z'-]{5,}/g, (word) => {
    const stripped = word.replace(/[^A-Za-z]/g, '');
    if (stripped.length < 6) return word;
    const fix = closestTerm(stripped);
    return fix ?? word;
  });
}
