// Uses the editable glossary (data/medicalTerms.ts) two ways:
//   1) correctMedicalTerms(text) — conservatively fixes near-miss single-word terms
//      that STT mis-heard (e.g. "azithromicin" → "Azithromycin").
//   2) glossaryForPrompt() — the exact spellings, handed to the report AI so it
//      normalises whatever the transcript approximates.

import { MEDICAL_TERMS } from '../data/medicalTerms.js';

// De-duplicated canonical terms.
const TERMS = [...new Set(MEDICAL_TERMS.map(t => t.trim()).filter(Boolean))];

// Single-word tokens from the glossary (only distinctive ones, length >= 5), mapped
// lower-case → canonical casing. Multi-word terms are left to the report AI.
const WORD_MAP = new Map<string, string>();
for (const term of TERMS) {
  for (const w of term.split(/\s+/)) {
    const key = w.toLowerCase().replace(/[^a-z0-9]/gi, '');
    if (key.length >= 5 && !WORD_MAP.has(key)) WORD_MAP.set(key, w);
  }
}
const WORD_KEYS = [...WORD_MAP.keys()];

/** The glossary as a compact string for the report-generation prompt. */
export function glossaryForPrompt(): string {
  return TERMS.join(', ');
}

// Levenshtein edit distance (early-exit once it exceeds `max`).
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

// Closest glossary word within a tight edit-distance budget, or null. Kept
// conservative (distance 1 for short words, 2 for long) so ordinary words aren't
// "corrected" — medicine names are distinctive enough for this to be safe.
function closestTerm(token: string): string | null {
  const key = token.toLowerCase();
  if (WORD_MAP.has(key)) return null; // already correct
  const budget = key.length >= 9 ? 2 : 1;
  let best: string | null = null;
  let bestDist = budget + 1;
  for (const cand of WORD_KEYS) {
    if (Math.abs(cand.length - key.length) > budget) continue;
    const d = editDistance(key, cand, budget);
    if (d <= budget && d < bestDist) {
      bestDist = d;
      best = WORD_MAP.get(cand)!;
      if (d === 1) break;
    }
  }
  return best;
}

/**
 * Conservatively correct mis-transcribed medical terms in free text. Only
 * alphabetic tokens (length >= 6) that are a near-miss of a known glossary word are
 * replaced; everything else is left exactly as written.
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
