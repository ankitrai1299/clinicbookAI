// The second line under the live transcript: what was said, in a language the
// doctor reads.
//
// ── Why this is not "translation" ─────────────────────────────────────────
//
// The live transcript keeps the patient's own words — Bhojpuri stays Bhojpuri,
// Bengali stays Bengali. That is the promise, and it is the right one: a
// clinical record of what a patient said should be what they said.
//
// It is also, for a doctor who does not speak that language, unreadable. So a
// second line sits under it carrying the MEANING, in Hindi or English.
//
// Word-for-word is not enough here and can be actively wrong. "पेट में जलन" is
// literally "burning in the stomach"; a doctor wants "heartburn / acidity". A
// patient saying "चक्कर" may mean vertigo, may mean light-headedness, and the
// difference changes what gets examined. So this asks a model for the clinical
// sense of the sentence, and tells it plainly not to diagnose — rendering what
// was said is the job, and adding to it would put words in a patient's mouth
// inside their own medical record.
//
// ── Not on the critical path ──────────────────────────────────────────────
//
// This runs per finished sentence while the consultation is still going. It must
// never hold up the live line: the transcript is the thing the doctor is
// watching, and a meaning that arrives two seconds later is useful, while a
// transcript that stutters is not. Every failure here returns null and the line
// simply has no second row.

import { complete, isAiConfigured } from '../../../core/ai/llm.js';
import { translateText } from '../../../core/ai/translate.js';

/** What the doctor can ask for under the live line. */
export type MeaningLanguage = 'off' | 'hi' | 'en';

export const isMeaningLanguage = (v: unknown): v is MeaningLanguage =>
  v === 'off' || v === 'hi' || v === 'en';

const LABEL: Record<'hi' | 'en', string> = { hi: 'Hindi', en: 'English' };

/**
 * Is a second line worth showing at all?
 *
 * When the sentence is already in the language the doctor asked for, repeating
 * it underneath is noise — and worse, it makes the screen look like it is doing
 * something when it is not. Detection is the provider's, never guessed here; an
 * unknown language means we show the meaning rather than assume it is redundant.
 */
export const needsMeaning = (detected: string | undefined, target: MeaningLanguage): boolean => {
  if (target === 'off') return false;
  const lang = (detected || '').trim().toLowerCase().split('-')[0];
  if (!lang) return true;
  return lang !== target;
};

const SYSTEM = `You render a single line of clinic speech into %LANG% for a doctor to read.

Rules:
- Output ONLY the rendered line. No preamble, no quotes, no notes.
- Convey the CLINICAL sense, not a word-for-word gloss. "पेट में जलन" is heartburn or acidity, not "burning in the stomach".
- Keep drug names, dosages, test names and numbers EXACTLY as they appear. Never convert a number, a unit or a strength.
- Do not diagnose, do not add findings, do not tidy a symptom into a condition. If the speaker was vague, stay vague.
- If the line is already in %LANG%, return it unchanged.`;

/**
 * The meaning of one finished line, or null when there is nothing worth adding.
 *
 * OpenAI first because the judgement above — clinical sense over literal gloss —
 * is the part a translation endpoint does not do. Sarvam's translator is the
 * fallback: it is a genuine Indian-language translator and a literal rendering
 * is far better than a blank row.
 */
export const meaningOf = async (
  line: string,
  target: MeaningLanguage,
  detected?: string
): Promise<string | null> => {
  const text = (line || '').trim();
  if (!text || target === 'off') return null;
  if (!needsMeaning(detected, target)) return null;

  if (isAiConfigured()) {
    try {
      const out = await complete({
        system: SYSTEM.replaceAll('%LANG%', LABEL[target]),
        user: text,
        temperature: 0
      });
      const trimmed = out.trim();
      if (trimmed && trimmed !== text) return trimmed;
      if (trimmed === text) return null; // already in the target language
    } catch (err) {
      console.warn('[liveMeaning] OpenAI failed, falling back:', (err as Error).message);
    }
  }

  try {
    const out = (await translateText(text, target)).trim();
    return out && out !== text ? out : null;
  } catch (err) {
    console.warn('[liveMeaning] translation unavailable:', (err as Error).message);
    return null;
  }
};
