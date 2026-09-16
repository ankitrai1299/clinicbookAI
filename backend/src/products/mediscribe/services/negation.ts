// Did the transcript say this thing IS there, or that it is NOT?
//
// ── Why this is code and not a prompt ─────────────────────────────────────
//
// Measured, twice, on both available models: given
//
//   "Patient ko Penicillin se allergy NAHI hai"
//
// the generated report came back with
//
//   allergies: [{ allergy: "Penicillin" }]
//
// The exact opposite of what the doctor said, and a record that would deny that
// patient the right antibiotic for years afterwards.
//
// The extraction prompt was then given an explicit rule — negation is a clinical
// fact, a denied allergy is not an allergy, leave the field empty — in capitals,
// with examples in both languages. The model produced the false allergy anyway.
//
// So this is not left to instruction. A model that is usually right about
// negation is not good enough when being wrong means anaphylaxis, and the
// question "was this word denied" is small enough to answer with code that gives
// the same answer every time.
//
// The same clause logic is used by the benchmark to score negation accuracy —
// one implementation, so the thing that measures and the thing that protects
// cannot drift apart.

import { devanagariToLatin, phoneticKey } from './devanagariTerms.js';

/** Words that flip a clinical statement, across the languages a clinic speaks. */
const NEGATORS = [
  'nahi', 'nahin', 'na', 'no', 'not', "n't", 'never', 'without', 'denies', 'denied',
  'negative', 'ruled', 'absent',
  'नहीं', 'नही', 'ना', 'नाही', 'नइखे', 'नइख', 'নেই', 'না', 'இல்லை', 'లేదు'
];

/**
 * Words that end one statement and begin another.
 *
 * A negation belongs to its own clause and stops at the join. Without this,
 * "allergy nahi hai AUR sugar hai" reads the "nahi" of the first statement as
 * negating the second — and a guard that removes findings the patient DOES have
 * is as dangerous as one that keeps findings they do not.
 */
const CLAUSE_BREAKS = new Set([
  'aur', 'lekin', 'par', 'magar', 'phir', 'isliye', 'kyunki', 'to',
  'and', 'but', 'however', 'so', 'because', 'although', 'while',
  'और', 'लेकिन', 'पर', 'मगर', 'इसलिए', 'क्योंकि', 'फिर'
]);

/**
 * A question is not an answer.
 *
 * This guard reads any mention without a negator as an affirmation, which is
 * right for a statement and wrong for a question — and a consultation is mostly
 * questions. Measured on a real one:
 *
 *   डॉक्टर: किसी दवा से एलर्जी? Penicillin वगैरह?
 *   मरीज़: Penicillin से एलर्जी नहीं है।
 *
 * The doctor's question names Penicillin and contains no "nahi", so it counted
 * as an affirmation, outvoted the patient's denial one line later, and
 * Penicillin went onto the chart as an allergy — the exact outcome this file
 * exists to prevent. Asking about a drug is not a report of reacting to one.
 */
const isQuestion = (sentence: string): boolean => /\?\s*$/.test(sentence.trim());

/** Sentences WITH their terminator, so a question is still recognisable as one. */
const sentencesOf = (text: string): string[] => (text || '').match(/[^.!?।\n]+[.!?।\n]*/g) || [];

export const words = (text: string): string[] =>
  (text || '')
    .toLowerCase()
    .replace(/[.,;:!?।|"'`()\[\]{}]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

/**
 * Is this the same word, whatever script it arrived in?
 *
 * The transcription engine's script is not stable — the same Hindi came back as
 * "बुखार" on one run and "bukhaar" on another — and a guard that only recognises
 * one spelling protects only half the consultations.
 */
const sameWord = (a: string, b: string): boolean => {
  if (a === b) return true;
  const ka = phoneticKey(devanagariToLatin(a));
  const kb = phoneticKey(devanagariToLatin(b));
  return ka.length >= 2 && ka === kb;
};

/**
 * Was `term` denied where the transcript mentions it?
 *
 * Returns null when the term does not appear at all — which is NOT the same as
 * "not denied". A caller deciding whether to keep an extracted finding must
 * treat null as "the transcript does not support this either way", and the
 * report layer treats that as a reason to keep it, because the model may have
 * read a paraphrase this cannot match.
 */
export const isDeniedIn = (transcript: string, term: string): boolean | null => {
  const needle = words(term);
  if (!needle.length || !(transcript || '').trim()) return null;

  // Sentences first, then clauses inside them. A full stop is a harder boundary
  // than any conjunction, and without it "Allergy nahi hai. Sorry, allergy hai"
  // reads as one long denial — the guard would then delete a real allergy the
  // doctor had just corrected themselves about.
  const sentences = sentencesOf(transcript).filter((x) => x.trim());
  let found = false;

  for (const sentence of sentences) {
    // A question mentions the term without asserting it, either way.
    if (isQuestion(sentence)) continue;
    const hyp = words(sentence);
    for (let i = 0; i + needle.length <= hyp.length; i++) {
      if (!needle.every((w, k) => sameWord(hyp[i + k], w))) continue;
      found = true;

      // The clause this mention sits in: back to the previous break, forward to
      // the next.
      let from = i;
      while (from > 0 && !CLAUSE_BREAKS.has(hyp[from - 1])) from--;
      let to = i + needle.length;
      while (to < hyp.length && !CLAUSE_BREAKS.has(hyp[to])) to++;

      const negated = hyp.slice(from, to).some((w) => NEGATORS.some((n) => sameWord(w, n)));
      // ANY affirmed mention wins, anywhere in the transcript. A doctor who says
      // "allergy nahi hai" and then corrects themselves has an allergic patient,
      // and the safe reading of a contradiction about an allergy is that it is
      // real.
      if (!negated) return false;
    }
  }
  return found ? true : null;
};
