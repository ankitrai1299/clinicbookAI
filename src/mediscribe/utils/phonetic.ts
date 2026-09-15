// Is this the same word, whatever script it arrived in?
//
// ── Why this is needed at all ─────────────────────────────────────────────
//
// The transcription engine's script is not stable. The same Hindi sentence came
// back as "बुखार नहीं है" on one run and "bukhaar nahi hai" on another, measured
// on identical audio. That is a rendering difference, not a clinical one — but
// anything that compares two visits by comparing strings cannot tell.
//
// Left alone, a patient on the same medicine for six months reads as:
//
//     stopped   Paracetamol
//     started   पैरासिटामोल
//
// A medication change that never happened, on the screen a doctor uses to decide
// whether the treatment is working. Same for symptoms: "bukhaar resolved, बुखार
// new" out of one unchanged fever.
//
// ── Mirrored from the backend ─────────────────────────────────────────────
//
// This is the same reduction as `phoneticKey` in
// backend/src/products/mediscribe/services/devanagariTerms.ts, which is where it
// is tested. Duplicated rather than shared because the two builds have no common
// package — the same arrangement as scribeWindow. If one changes, change both.

const VOWEL_SIGNS: Record<string, string> = {
  'ा': 'a', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u', 'ृ': 'ri',
  'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ं': 'n', 'ँ': 'n', 'ः': 'h',
};

const INDEPENDENT: Record<string, string> = {
  'अ': 'a', 'आ': 'a', 'इ': 'i', 'ई': 'i', 'उ': 'u', 'ऊ': 'u', 'ऋ': 'ri',
  'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au',
};

const CONSONANTS: Record<string, string> = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n',
  'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'n',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'ळ': 'l',
  'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h',
  'क़': 'q', 'ख़': 'kh', 'ग़': 'g', 'ज़': 'z', 'ड़': 'r', 'ढ़': 'rh', 'फ़': 'f',
};

const VIRAMA = '्';
const NUKTA = '़';

/** A Devanagari word, sounded out in Latin letters. Latin passes through. */
export const devanagariToLatin = (word: string): string => {
  let out = '';
  const chars = [...word];
  for (let i = 0; i < chars.length; i++) {
    let ch = chars[i];
    if (chars[i + 1] === NUKTA && CONSONANTS[ch + NUKTA]) {
      ch += NUKTA;
      i++;
    }
    if (INDEPENDENT[ch]) { out += INDEPENDENT[ch]; continue; }
    if (VOWEL_SIGNS[ch]) { out += VOWEL_SIGNS[ch]; continue; }
    if (CONSONANTS[ch]) {
      out += CONSONANTS[ch];
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

/**
 * The consonants that survive speech, a second language and a second script.
 *
 * Vowels are dropped because they are where transliteration disagrees most —
 * "bukhaar", "bukhar" and "बुखार" differ only in vowels and are one word.
 */
const key = (word: string): string => {
  let s = devanagariToLatin(word).toLowerCase().replace(/[^a-z]/g, '');
  // English spelling, reduced to the sounds an Indian speaker makes and an
  // Indian script writes:
  //   c  is /s/ before e, i, y   (Paracetamol → पैरासिटामोल)  and /k/ elsewhere
  //   g  is /j/ before e, i, y   (allergy → एलर्जी, surgery → सर्जरी)
  // The g rule was missing and cost a real measurement: a correct transcript of
  // "Penicillin se allergy hai" scored 0% on negation, because "allergy" reduced
  // to lrg and "एलर्जी" to lrj, so the term was never found and the negation
  // could not be checked. A false alarm on the safety metric.
  s = s.replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k');
  s = s.replace(/g(?=[eiy])/g, 'j');
  s = s.replace(/ph/g, 'f').replace(/sh/g, 's').replace(/th/g, 't');
  s = s.replace(/z/g, 'j').replace(/q/g, 'k').replace(/x/g, 'ks').replace(/w/g, 'v');
  s = s.replace(/[aeiouy]/g, '');
  return s.replace(/(.)\1+/g, '$1');
};

/**
 * A comparison key for a phrase: same phrase, same key, whichever script.
 *
 * Falls back to plain lowercase when the reduction comes out too short to trust
 * — a one or two consonant key collides with half the language, and a false
 * match between two different medicines is far worse than a missed one.
 */
export const matchKey = (phrase: string): string => {
  const plain = (phrase || '').trim().toLowerCase();
  if (!plain) return '';
  const reduced = plain.split(/\s+/).map(key).filter(Boolean).join(' ');
  return reduced.replace(/\s/g, '').length >= 3 ? reduced : plain;
};
