// Numbers a doctor says out loud, written the way a chart needs them.
//
// ── The problem, measured ─────────────────────────────────────────────────
//
// Nobody dictates digits. What comes out of a doctor's mouth is:
//
//   "BP kal se one forty by ninety aa raha hai"
//   "Amlodipine five mg continue karna hai"
//
// and what a chart, a pharmacist and every downstream calculation need is
// "140/90" and "5 mg". The benchmark's num-bp case scores 0% on dosage today
// for exactly this, and it was put there knowing it would fail.
//
// ── The rule that keeps this safe ─────────────────────────────────────────
//
// ONLY numbers attached to a measurement are converted: a unit follows them
// (mg, ml, mcg, units), or they sit in a blood-pressure "X by Y". Everything
// else is left exactly as spoken.
//
// That restraint is the whole design. "Do din se bukhar hai" is two days of
// fever, and "2 din se bukhar hai" is not an improvement — it is a rewrite of a
// patient's words for no clinical gain. And a number rewritten in the wrong
// place is worse than one left in words: "one" in "one of the tablets" becoming
// "1" reads as a dose.
//
// Deterministic — no model, no network. This runs on finished lines while the
// consultation is still going, so it cannot cost a round trip, and it must
// produce the same answer every time it sees the same words. A model that
// converts numbers "usually correctly" has no place near a dose.

const ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19
};

const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90
};

/**
 * Words that sit between the two halves of a blood pressure.
 *
 * "by" is how it is said in English, "over" is how it is dictated, and "बटे" is
 * how it is said in Hindi — measured on a real consultation, where the report
 * came out reading "150 over 96 millimeters of mercury". That is faithful to
 * the speech and useless on a chart: nothing downstream can read it as a blood
 * pressure, compare it to the last visit, or flag it as high.
 */
const BP_SEPARATORS = new Set(['by', 'over', 'बटे', 'बाई', 'स्लैश', '/']);

/** Units that make a preceding number a dose rather than a count of anything. */
const UNITS = new Set([
  'mg', 'mgs', 'ml', 'mls', 'mcg', 'g', 'gm', 'gms', 'gram', 'grams',
  'unit', 'units', 'iu', 'mmhg', 'kg', 'kgs',
  // Weight came back as "twelve kilograms" on a paediatric consultation — a
  // dose calculated from a weight nobody can read as a number. The unit is
  // written out far more often than it is abbreviated when a doctor says it
  // aloud, and the same is true in Hindi.
  'kilo', 'kilos', 'kilogram', 'kilograms', 'किलो', 'किलोग्राम',
  'cm', 'cms', 'centimetre', 'centimetres', 'centimeter', 'centimeters',
  'mmol', 'mg/dl', 'mgdl', 'बार', 'मिलीग्राम', 'एमएल'
]);

/**
 * A run of number words → its value, or null.
 *
 * Handles the two shapes a doctor actually uses: "five", "forty", "forty five",
 * "two hundred ten", "one forty" (which is how a blood pressure is said and
 * means 140, not 1 and 40).
 */
const parseNumberWords = (tokens: string[]): number | null => {
  if (!tokens.length) return null;

  let total = 0;
  let current = 0;
  let seen = false;

  for (const raw of tokens) {
    const t = raw.toLowerCase();
    if (t === 'and') continue;

    if (ONES[t] !== undefined) {
      current += ONES[t];
      seen = true;
    } else if (TENS[t] !== undefined) {
      current += TENS[t];
      seen = true;
    } else if (t === 'hundred') {
      current = (current || 1) * 100;
      seen = true;
    } else if (t === 'thousand') {
      total += (current || 1) * 1000;
      current = 0;
      seen = true;
    } else {
      return null;
    }
  }
  return seen ? total + current : null;
};

/**
 * "one forty" → 140.
 *
 * How every blood pressure and most sugar readings are spoken: the hundreds are
 * dropped and the digits are read in pairs. Applied only where the shape is
 * unambiguous — a single digit followed by a tens word — because "one forty" can
 * only be 140; nobody means one and then forty.
 */
const parsePairedReading = (tokens: string[]): number | null => {
  if (tokens.length !== 2) return null;
  const first = ONES[tokens[0].toLowerCase()];
  const second = TENS[tokens[1].toLowerCase()] ?? ONES[tokens[1].toLowerCase()];
  if (first === undefined || second === undefined) return null;
  if (first < 1 || first > 9) return null;
  if (second < 10 || second > 99) return null;
  return first * 100 + second;
};

/**
 * Paired reading FIRST, and the order is the bug this was written after.
 *
 * "one forty" summed to 41 when the general parser went first — one plus forty
 * — and a blood pressure of 41/90 is both nonsense and, if anyone believed it,
 * an emergency. The paired shape is deliberately narrow (one digit then a tens
 * word) so it can only claim readings that have no other reading: nobody says
 * "one forty" meaning one and then forty.
 */
const valueOf = (tokens: string[]): number | null => {
  // Already a number. A doctor dictating "150 बटे 96" gives the digits and only
  // the separator in words, so half of every Hindi blood pressure arrives like
  // this — and a rule that only understands number WORDS would leave it as
  // "150 बटे 96" on the chart.
  if (tokens.length === 1 && /^\d{1,3}$/.test(tokens[0])) return Number(tokens[0]);
  return parsePairedReading(tokens) ?? parseNumberWords(tokens);
};

/**
 * Is this pair a plausible blood pressure?
 *
 * Guards the one risk digits introduce: "patient 45 by 2" or a stray pair of
 * numbers should not become a reading. Outside human range it is left as spoken,
 * because an invented vital is worse than an unconverted one.
 */
const plausibleBp = (systolic: number, diastolic: number): boolean =>
  systolic >= 50 && systolic <= 300 && diastolic >= 30 && diastolic <= 200 && systolic > diastolic;

const isNumberWord = (t: string): boolean => {
  const w = stripPunct(t).toLowerCase();
  if (/^\d{1,3}$/.test(w)) return true;
  return ONES[w] !== undefined || TENS[w] !== undefined || w === 'hundred' || w === 'thousand' || w === 'and';
};

interface Run {
  from: number;
  to: number; // exclusive
  tokens: string[];
}

/** Every maximal run of number words in a token list. */
const numberRuns = (tokens: string[]): Run[] => {
  const runs: Run[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (!isNumberWord(tokens[i])) {
      i++;
      continue;
    }
    const from = i;
    while (i < tokens.length && isNumberWord(tokens[i])) i++;
    // A run that is only "and" is not a number.
    const tok = tokens.slice(from, i);
    if (tok.some((t) => t.toLowerCase() !== 'and')) runs.push({ from, to: i, tokens: tok });
  }
  return runs;
};

const stripPunct = (t: string): string => t.replace(/[.,;:!?।]/g, '');

/**
 * Rewrite spoken measurements as digits, leaving everything else alone.
 *
 * Two shapes are converted, and only these two:
 *
 *   a number followed by a unit          "five mg"              → "5 mg"
 *   a blood pressure said as X by Y      "one forty by ninety"  → "140/90"
 *
 * Anything else — a number with no unit, a count, a duration — is untouched.
 */
export const normaliseSpokenNumbers = (text: string): string => {
  if (!text) return text;

  const tokens = text.split(/(\s+)/); // keep the whitespace, so spacing survives
  const words: string[] = [];
  const indexOfWord: number[] = [];
  tokens.forEach((t, i) => {
    if (t.trim()) {
      words.push(stripPunct(t));
      indexOfWord.push(i);
    }
  });

  const replace = (wordFrom: number, wordTo: number, value: string): void => {
    // Trailing punctuation on the last word is kept — "five mg." must not lose
    // its full stop.
    const last = tokens[indexOfWord[wordTo - 1]];
    const tail = last.slice(stripPunct(last).length);
    for (let w = wordFrom; w < wordTo; w++) tokens[indexOfWord[w]] = '';
    tokens[indexOfWord[wordFrom]] = value + tail;
  };

  const runs = numberRuns(words);

  // Right to left, so replacing one run cannot shift the indexes of another.
  for (let r = runs.length - 1; r >= 0; r--) {
    const run = runs[r];

    // Blood pressure: <run> by|over|बटे <run>
    const next = runs[r + 1];
    const between = stripPunct(words[run.to] ?? '').toLowerCase();
    if (next && BP_SEPARATORS.has(between) && next.from === run.to + 1) {
      const systolic = valueOf(run.tokens);
      const diastolic = valueOf(next.tokens);
      if (systolic !== null && diastolic !== null && plausibleBp(systolic, diastolic)) {
        replace(run.from, next.to, `${systolic}/${diastolic}`);
        continue;
      }
    }

    // A dose: <run> <unit>
    const unit = words[run.to]?.toLowerCase();
    if (unit && UNITS.has(stripPunct(unit))) {
      const value = valueOf(run.tokens);
      if (value !== null) {
        replace(run.from, run.to, String(value));
      }
    }
  }

  return tokens.join('').replace(/\s{2,}/g, ' ').trim();
};
