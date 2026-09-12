// Putting drug names back into the alphabet a chart is written in.
//
// ── The problem, measured ─────────────────────────────────────────────────
//
// A doctor in an Indian clinic code-mixes constantly. Spoken:
//
//   "Patient ko two days se fever hai, BP bhi high hai, Paracetamol 650 likh raha hoon"
//
// Live transcription returns, faithfully:
//
//   "पेशेंट को दो दिन से फीवर है, बीपी भी हाई चल रहा है, पैरासिटामोल 650 लिख रहा हूं"
//
// Every word is right. The transcript is still wrong for its purpose, because
// "पैरासिटामोल 650" is not a prescription — a pharmacist reads Paracetamol, a
// chart carries Paracetamol, and no drug index in the country is keyed on the
// Devanagari spelling of an English name.
//
// ── What this does, and what it deliberately does not ─────────────────────
//
// ONLY drug, test and diagnosis names from the clinic's own glossary, plus a
// short list of abbreviations that are always said in English. Ordinary words
// are left exactly as spoken: फीवर stays फीवर. The doctor said it in English and
// a Hindi reader reads it without trouble, and every word "improved" here is a
// word that can be damaged instead. The narrow rule is the safe one.
//
// Deterministic — no model, no network, no latency. This runs on every finalised
// line while the consultation is still happening, so it cannot cost a round trip.

import { MEDICAL_TERMS } from '../data/medicalTerms.js';

// ── Devanagari → Latin ────────────────────────────────────────────────────
//
// Phonetic, not scholarly. The output is never shown to anybody: it exists only
// to be matched against a list, so it optimises for matching rather than for
// being a correct romanisation.

const VOWEL_SIGNS: Record<string, string> = {
  'ा': 'a', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u', 'ृ': 'ri',
  'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ं': 'n', 'ँ': 'n', 'ः': 'h'
};

const INDEPENDENT: Record<string, string> = {
  'अ': 'a', 'आ': 'a', 'इ': 'i', 'ई': 'i', 'उ': 'u', 'ऊ': 'u', 'ऋ': 'ri',
  'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au'
};

const CONSONANTS: Record<string, string> = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n',
  'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'n',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'ळ': 'l',
  'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h',
  // Nukta forms. Indian transcription uses these for exactly the English sounds
  // that appear in drug names — ज़ for z, फ़ for f — so they matter here.
  'क़': 'q', 'ख़': 'kh', 'ग़': 'g', 'ज़': 'z', 'ड़': 'r', 'ढ़': 'rh', 'फ़': 'f'
};

const VIRAMA = '्';
const NUKTA = '़';

/** A Devanagari word, sounded out in Latin letters. */
export const devanagariToLatin = (word: string): string => {
  let out = '';
  const chars = [...word];

  for (let i = 0; i < chars.length; i++) {
    let ch = chars[i];
    if (chars[i + 1] === NUKTA && CONSONANTS[ch + NUKTA]) {
      ch = ch + NUKTA;
      i++;
    }

    if (INDEPENDENT[ch]) {
      out += INDEPENDENT[ch];
      continue;
    }
    if (VOWEL_SIGNS[ch]) {
      out += VOWEL_SIGNS[ch];
      continue;
    }
    if (CONSONANTS[ch]) {
      out += CONSONANTS[ch];
      // Every consonant carries an inherent 'a' unless a vowel sign or a virama
      // follows it. Without this rule क्रम and करम collapse to one string.
      const next = chars[i + 1];
      const after = next === NUKTA ? chars[i + 2] : next;
      if (after !== VIRAMA && !VOWEL_SIGNS[after ?? '']) out += 'a';
      continue;
    }
    if (ch === VIRAMA || ch === NUKTA) continue;
    out += ch;
  }
  return out;
};

// ── The matching key ──────────────────────────────────────────────────────
//
// Sounding out पैरासिटामोल gives "pairasitamola"; the target is "paracetamol".
// Thirteen letters against eleven, and an edit distance too wide to trust — the
// vowels are where transliteration guesses most and agrees least.
//
// So both sides are reduced to their CONSONANT SKELETON, which is what actually
// survives the trip through speech, a second language and a second script:
//
//   paracetamol    → p r s t m l
//   pairasitamola  → p r s t m l
//
// English spelling rules are applied first so the skeletons can agree at all:
// 'c' is /s/ before e, i or y and /k/ elsewhere — the single rule that makes
// Paracetamol and Calcium both come out right.

const phoneticKey = (latin: string): string => {
  let s = latin.toLowerCase().replace(/[^a-z]/g, '');
  s = s.replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k');
  s = s.replace(/ph/g, 'f').replace(/sh/g, 's').replace(/th/g, 't');
  s = s.replace(/z/g, 'j').replace(/q/g, 'k').replace(/x/g, 'ks').replace(/w/g, 'v');
  s = s.replace(/[aeiouy]/g, '');
  return s.replace(/(.)\1+/g, '$1');
};

const editDistance = (a: string, b: string, max: number): number => {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1;
    prev = curr;
  }
  return prev[b.length];
};

/** Glossary terms indexed by skeleton, built once. */
const BY_KEY = (() => {
  const map = new Map<string, string>();
  for (const term of MEDICAL_TERMS) {
    const key = phoneticKey(term);
    // Skeletons shorter than three consonants are too easy to collide with.
    // Abbreviations are handled by exact match below instead of by sounding out.
    if (key.length >= 3 && !map.has(key)) map.set(key, term);
  }
  return map;
})();

/**
 * Said in English every time, written in Devanagari every time.
 *
 * Exact matches only. These are too short for skeleton matching to be safe — a
 * two-consonant key collides with half the language — so they are listed rather
 * than inferred, and the list stays small on purpose.
 */
const ABBREVIATIONS: Record<string, string> = {
  'बीपी': 'BP', 'ईसीजी': 'ECG', 'ईकेजी': 'EKG', 'सीबीसी': 'CBC',
  'एमआरआई': 'MRI', 'सीटी': 'CT', 'एक्सरे': 'X-ray', 'एक्स-रे': 'X-ray',
  'ईएसआर': 'ESR', 'सीआरपी': 'CRP', 'एचबी': 'Hb', 'टीएसएच': 'TSH',
  'एलएफटी': 'LFT', 'केएफटी': 'KFT', 'आरबीएस': 'RBS', 'एफबीएस': 'FBS',
  'पीपीबीएस': 'PPBS', 'यूएसजी': 'USG', 'ओआरएस': 'ORS',
  'एमजी': 'mg', 'एमएल': 'ml', 'आईवी': 'IV', 'आईएम': 'IM'
};

const DEVANAGARI_WORD = /[ऀ-ॿ]+/g;

/**
 * Rewrite the drug, test and diagnosis names in a line of Devanagari back into
 * Latin, leaving every other word untouched.
 *
 * A word is only replaced when its consonant skeleton matches a glossary term
 * EXACTLY, or by a single edit when the skeleton is long enough (five or more)
 * for one edit not to be a coincidence. Anything less certain is left alone: a
 * transcript with a Devanagari drug name is a nuisance, and a transcript with
 * the WRONG drug name is a clinical error.
 */
export const restoreLatinTerms = (text: string): string => {
  if (!text) return text;

  return text.replace(DEVANAGARI_WORD, (word) => {
    const exact = ABBREVIATIONS[word];
    if (exact) return exact;

    if ([...word].length < 4) return word;

    const key = phoneticKey(devanagariToLatin(word));
    if (key.length < 3) return word;

    const direct = BY_KEY.get(key);
    if (direct) return direct;

    if (key.length < 5) return word;
    let best: string | null = null;
    for (const [candidate, term] of BY_KEY) {
      if (candidate.length < 5) continue;
      if (editDistance(key, candidate, 1) <= 1) {
        // Two different terms one edit away means the word is ambiguous, and a
        // coin toss between two drugs is the one outcome worth refusing.
        if (best && best !== term) return word;
        best = term;
      }
    }
    return best ?? word;
  });
};
