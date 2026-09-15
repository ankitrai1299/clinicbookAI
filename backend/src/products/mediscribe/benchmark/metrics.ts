// How we measure whether the scribe is getting better.
//
// ── Why this file exists before anything is improved ──────────────────────
//
// Every change to the speech pipeline from here on — a prompt, a different
// model, a correction rule — is a claim that something got better. Without a
// number, the claim is a feeling, and feelings about transcription quality are
// notoriously wrong: you remember the one word it mangled and forget the two
// hundred it got right.
//
// ── Word error rate is not enough, and can actively mislead ───────────────
//
// A transcript can score a respectable 8% WER and still be dangerous. These two
// differ by ONE word out of ten — 10% WER — and one of them is a prescription
// that kills somebody:
//
//   "Penicillin se allergy hai"
//   "Penicillin se allergy nahi hai"
//
// And these two are identical to WER's eye if the reference is written the same
// way, while a pharmacist can only dispense one of them:
//
//   "Amlodipine 5 mg"
//   "amlodipine five mg"
//
// So WER is reported, but it is the least important number here. The ones that
// decide whether this is safe are the drug, dosage and negation accuracies.

/** One measured comparison of a transcript against what was actually said. */
export interface Scores {
  /** Word error rate, 0–1. Lower is better. Context, not verdict. */
  wer: number;
  /** Of the drug/test names that were said, the share spelled correctly. */
  drugAccuracy: number | null;
  /** Of the numbers and units that were said, the share carried across exactly. */
  dosageAccuracy: number | null;
  /** Of the negations that were said, the share still negated. */
  negationAccuracy: number | null;
}

/**
 * Words, for comparison purposes.
 *
 * Punctuation goes, case goes, and Devanagari is left alone — it has no case and
 * its word boundaries are already spaces. Numbers are NOT normalised here: "140"
 * and "one forty" must count as different, because to a chart they are.
 */
export const words = (text: string): string[] =>
  (text || '')
    .toLowerCase()
    .replace(/[.,;:!?।|"'`()\[\]{}]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

/**
 * Word error rate: edits needed to turn the transcript into what was said,
 * divided by how much was said.
 *
 * Can exceed 1 when a model hallucinates at length — which is a real failure
 * mode (Sarvam given the wrong language returned "sorry, sorry, sorry…"), so it
 * is deliberately not capped. A WER of 3.0 should look as alarming as it is.
 */
export const wer = (reference: string, hypothesis: string): number => {
  const ref = words(reference);
  const hyp = words(hypothesis);
  if (!ref.length) return hyp.length ? 1 : 0;

  let prev = Array.from({ length: hyp.length + 1 }, (_, i) => i);
  for (let i = 1; i <= ref.length; i++) {
    const curr = [i];
    for (let j = 1; j <= hyp.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1)
      );
    }
    prev = curr;
  }
  return prev[hyp.length] / ref.length;
};

/**
 * Did the named terms survive, spelled the way a chart needs them?
 *
 * Case-insensitive, because a chart reading "paracetamol" is right and the
 * capital is cosmetic. Substring rather than whole-word, because "Amoxicillin"
 * inside "Amoxicillin-Clavulanate" is still the drug being named.
 *
 * Deliberately NOT fuzzy. "Metformin" and "Metronidazole" are one fuzzy match
 * apart and treat different organs; a metric that forgives the gap would report
 * success on the exact failure it exists to catch.
 */
export const termAccuracy = (expected: string[], hypothesis: string): number | null => {
  if (!expected.length) return null;
  const hay = (hypothesis || '').toLowerCase();
  const found = expected.filter((t) => hay.includes(t.toLowerCase().trim())).length;
  return found / expected.length;
};

/**
 * Did the numbers survive exactly?
 *
 * Every dose, every reading, every count, matched as written: "5 mg", "140/90",
 * "650". No tolerance and no rounding, because there is no such thing as nearly
 * the right dose.
 *
 * Whitespace inside an expectation is collapsed before matching, so "5 mg" also
 * matches "5  mg" — a transcript's spacing is not a clinical fact.
 */
export const dosageAccuracy = (expected: string[], hypothesis: string): number | null => {
  if (!expected.length) return null;
  const hay = words(hypothesis);
  const found = expected.filter((d) => containsTokens(hay, words(d))).length;
  return found / expected.length;
};

/**
 * Does this sequence of words appear, whole, inside that one?
 *
 * Whole words, never a substring. A plain substring search finds "5 mg" inside
 * "25 mg" and reports the dose as correct — a false pass on a fivefold overdose,
 * from the metric whose only job is to catch that.
 */
const containsTokens = (haystack: string[], needle: string[]): boolean => {
  if (!needle.length) return false;
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    if (needle.every((w, k) => haystack[i + k] === w)) return true;
  }
  return false;
};

/** Words that flip a clinical statement, across the languages a clinic speaks. */
const NEGATORS = [
  'nahi', 'nahin', 'na', 'no', 'not', "n't", 'never', 'without', 'denies', 'denied',
  'नहीं', 'नही', 'ना', 'नाही', 'नइखे', 'नइख', 'নেই', 'না', 'இல்லை', 'లేదు'
];

/**
 * Words that end one statement and begin another.
 *
 * A negation belongs to its own clause and stops at the join. Without this,
 * "allergy nahi hai AUR sugar hai" reads the "nahi" of the first statement as
 * negating the second — the metric would report a correct transcript as having
 * inverted a diagnosis, and the alarm nobody can reproduce is the alarm everyone
 * learns to ignore.
 */
const CLAUSE_BREAKS = new Set([
  'aur', 'lekin', 'par', 'magar', 'phir', 'isliye', 'kyunki', 'to',
  'and', 'but', 'however', 'so', 'because', 'although', 'while',
  'और', 'लेकिन', 'पर', 'मगर', 'इसलिए', 'क्योंकि', 'फिर'
]);

/**
 * Is this statement still negated — or still not — in the transcript?
 *
 * The sentence is cut into clauses first, and the negator must sit in the SAME
 * clause as the term. A fixed window either side was tried and is wrong: four
 * words from "allergy" in "allergy nahi hai aur sugar hai" reaches the "nahi"
 * that belongs to the allergy and hangs it on the sugar.
 *
 * Clauses rather than grammar, because Hindi puts the negator after the noun
 * ("allergy NAHI hai"), English before it ("denies any allergy"), and a clinic
 * mixes both inside one breath. Nothing here pretends to parse a language nobody
 * speaks consistently.
 *
 * Its limit, stated because a metric that flatters itself is worse than none: it
 * cannot see a self-correction — "allergy hai… sorry, nahi hai". It catches the
 * failure that actually happens, a dropped "nahi", which is the one that turns a
 * safe note into a dangerous one.
 */
export const negationHolds = (
  hypothesis: string,
  term: string,
  shouldBeNegated: boolean
): boolean | null => {
  const hyp = words(hypothesis);
  const needle = words(term);
  if (!needle.length) return null;

  // Find the term. If the transcript lost it entirely, negation is unanswerable
  // here — that is a term-accuracy failure, and counting it twice would hide how
  // many distinct things went wrong.
  let at = -1;
  for (let i = 0; i + needle.length <= hyp.length; i++) {
    if (needle.every((w, k) => hyp[i + k] === w)) {
      at = i;
      break;
    }
  }
  if (at === -1) return null;

  // The clause the term sits in: back to the previous break, forward to the next.
  let from = at;
  while (from > 0 && !CLAUSE_BREAKS.has(hyp[from - 1])) from--;
  let to = at + needle.length;
  while (to < hyp.length && !CLAUSE_BREAKS.has(hyp[to])) to++;

  const negated = hyp.slice(from, to).some((w) => NEGATORS.includes(w));
  return negated === shouldBeNegated;
};

export interface NegationExpectation {
  term: string;
  negated: boolean;
}

export const negationAccuracy = (
  expected: NegationExpectation[],
  hypothesis: string
): number | null => {
  if (!expected.length) return null;
  const answered = expected
    .map((e) => negationHolds(hypothesis, e.term, e.negated))
    .filter((v): v is boolean => v !== null);
  // Every negation unanswerable because the terms were lost. Reporting 100%
  // here — "nothing was wrong with the negations we could check" — would be the
  // most flattering possible reading of a transcript that lost the words.
  if (!answered.length) return 0;
  return answered.filter(Boolean).length / answered.length;
};

export interface Expectations {
  /** What was actually said. */
  reference: string;
  /** Drug, test and diagnosis names that must survive, spelled for a chart. */
  drugs?: string[];
  /** Doses, readings and counts that must survive exactly. */
  dosages?: string[];
  /** Statements whose negation must survive. */
  negations?: NegationExpectation[];
}

export const score = (expect: Expectations, hypothesis: string): Scores => ({
  wer: wer(expect.reference, hypothesis),
  drugAccuracy: termAccuracy(expect.drugs ?? [], hypothesis),
  dosageAccuracy: dosageAccuracy(expect.dosages ?? [], hypothesis),
  negationAccuracy: negationAccuracy(expect.negations ?? [], hypothesis)
});
