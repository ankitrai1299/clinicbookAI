// Multilingual WhatsApp support ("translation sandwich"): detect the language a
// patient wrote in, translate their message INTO English so the (unchanged) FSM /
// brain understands it, then translate the reply BACK into their language before
// sending. Gated per-number (WHATSAPP_TRANSLATE_NUMBERS) so the live flow is
// byte-for-byte unchanged until a number is opted in.

import { translateText, isTranslatable } from '../ai/translate.js';
import type { BotReply } from './whatsapp.reply.js';

// Unicode block → our language code. Order doesn't matter (blocks are disjoint);
// Devanagari maps to Hindi (also used for Marathi).
const SCRIPT_RANGES: Array<[RegExp, string]> = [
  [/[஀-௿]/, 'ta'], // Tamil
  [/[ఀ-౿]/, 'te'], // Telugu
  [/[ঀ-৿]/, 'bn'], // Bengali
  [/[઀-૿]/, 'gu'], // Gujarati
  [/[ಀ-೿]/, 'kn'], // Kannada
  [/[ഀ-ൿ]/, 'ml'], // Malayalam
  [/[਀-੿]/, 'pa'], // Gurmukhi (Punjabi)
  [/[؀-ۿ]/, 'ur'], // Arabic (Urdu)
  [/[ऀ-ॿ]/, 'hi'] // Devanagari (Hindi/Marathi)
];

/** The language a message is written in (by script). Latin/other → 'en'. */
export const detectLang = (text: string): string => {
  const t = text || '';
  for (const [re, code] of SCRIPT_RANGES) if (re.test(t)) return code;
  return 'en';
};

// Stored patient.language name → code (used on button-tap turns that carry no text).
const NAME_TO_CODE: Record<string, string> = {
  english: 'en', hindi: 'hi', tamil: 'ta', telugu: 'te', bengali: 'bn', marathi: 'mr',
  gujarati: 'gu', kannada: 'kn', malayalam: 'ml', punjabi: 'pa', urdu: 'ur'
};
export const storedLangToCode = (language?: string | null): string =>
  NAME_TO_CODE[(language || '').toLowerCase().trim()] ?? 'en';

const CODE_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(NAME_TO_CODE).map(([name, code]) => [code, name[0].toUpperCase() + name.slice(1)])
);
export const codeToLangName = (code: string): string => CODE_TO_NAME[code] ?? 'English';

/** Per-number gate. blank/"off"→nobody, "all"/"*"→everyone, else a CSV of numbers. */
export const isTranslateEnabledFor = (phone: string): boolean => {
  const raw = (process.env.WHATSAPP_TRANSLATE_NUMBERS || '').trim().toLowerCase();
  if (!raw || raw === 'off') return false;
  if (raw === 'all' || raw === '*') return true;
  const digits = (phone || '').replace(/\D/g, '');
  return raw
    .split(',')
    .map((s) => s.replace(/\D/g, ''))
    .filter(Boolean)
    .some((n) => digits.endsWith(n) || n.endsWith(digits));
};

const cap = (s: string, n: number): string => (s || '').slice(0, n);

/**
 * Translate a bot reply (plain text OR interactive) from English into `target`.
 * Interactive option titles are truncated to WhatsApp's limits; option IDs are
 * untouched (a tap is matched by id, not visible title). Best-effort: falls back
 * to the original text per-field on any translation error.
 */
export const translateReply = async (reply: BotReply, target: string): Promise<BotReply> => {
  if (target === 'en' || !isTranslatable(target)) return reply;

  const tr = (s?: string): Promise<string | undefined> =>
    s ? translateText(s, target, 'en') : Promise.resolve(s);

  if (typeof reply === 'string') return translateText(reply, target, 'en');

  // reply is now an interactive (buttons/list) reply.
  const footerIn = (reply as { footer?: string }).footer;
  const [body, header, footer] = await Promise.all([tr(reply.body), tr(reply.header), tr(footerIn)]);

  if (reply.kind === 'buttons') {
    const buttons = await Promise.all(
      reply.buttons.map(async (b) => ({ ...b, title: cap((await tr(b.title)) ?? b.title, 20) }))
    );
    return { ...reply, body: body ?? reply.body, header, footer, buttons };
  }

  const [button, rows] = await Promise.all([
    tr(reply.button).then((s) => cap(s ?? reply.button, 20)),
    Promise.all(
      reply.rows.map(async (row) => ({
        ...row,
        title: cap((await tr(row.title)) ?? row.title, 24),
        description: row.description ? cap((await tr(row.description)) ?? row.description, 72) : row.description
      }))
    )
  ]);
  return { ...reply, body: body ?? reply.body, header, footer, button, rows };
};
