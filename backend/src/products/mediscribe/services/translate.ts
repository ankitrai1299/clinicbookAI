// Transcript translation via Sarvam AI.
//
// Converts a consultation transcript into the selected OUTPUT language/script.
//
// PRIMARY: Sarvam's purpose-built Translate API (/translate, model mayura:v1).
// It is not a reasoning model, so it has no per-request "thinking" token budget
// to exhaust — that is what fixes the "token budget exhausted" failures the chat
// model produced on longer transcripts. It reliably emits the correct target
// script for every supported Indian language + English.
//
// FALLBACK: the Sarvam chat model (with a script-forcing prompt) is used only
// when the Translate API cannot handle the request — i.e. the target is Urdu
// (unsupported by mayura:v1) or the source language could not be auto-detected.
// The chat path chunks small and retries on empty content so it too degrades
// gracefully rather than failing outright.
//
// The API key is read from the environment (SARVAM_API_KEY) and NEVER logged.

import { sarvamChat, sarvamKey, sarvamOrigin } from './sarvam.js';

// Supported OUTPUT languages (code → human name used in the chat-fallback prompt).
export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  hi: 'Hindi',
  ta: 'Tamil',
  te: 'Telugu',
  bn: 'Bengali',
  mr: 'Marathi',
  gu: 'Gujarati',
  kn: 'Kannada',
  ml: 'Malayalam',
  pa: 'Punjabi',
  ur: 'Urdu',
};

// code → Sarvam Translate API language code.
const TRANSLATE_TARGET: Record<string, string> = {
  en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN', te: 'te-IN', bn: 'bn-IN', mr: 'mr-IN',
  gu: 'gu-IN', kn: 'kn-IN', ml: 'ml-IN', pa: 'pa-IN', ur: 'ur-IN',
};

// mayura:v1 (the default Translate model) supports every target above EXCEPT
// Urdu, which must go through the chat fallback.
const CHAT_ONLY_TARGETS = new Set(['ur']);

// Target WRITING SYSTEM for each language — used only by the chat fallback, where
// the script must be pinned explicitly (Urdu/Hindi/Punjabi share a spoken
// language, so without it the chat model can echo the source script unchanged).
const SCRIPT_NAMES: Record<string, string> = {
  en: 'the Latin/English alphabet',
  hi: 'Devanagari script',
  ta: 'Tamil script',
  te: 'Telugu script',
  bn: 'Bengali script',
  mr: 'Devanagari script',
  gu: 'Gujarati script',
  kn: 'Kannada script',
  ml: 'Malayalam script',
  pa: 'Gurmukhi script',
  ur: 'Urdu (Perso-Arabic) script',
};

// mayura:v1 accepts at most 1000 characters per request, so transcripts are split
// into chunks on sentence boundaries and translated piece by piece, then re-joined
// verbatim in order. Kept under the limit with margin.
const CHUNK_CHARS = 900;
// Below this length a chat-fallback chunk is no longer worth splitting on an
// empty-content retry — we retry it as-is once more and then keep the original.
const MIN_SPLIT_CHARS = 200;

function chunkTranscript(text: string): string[] {
  if (text.length <= CHUNK_CHARS) return [text];
  const parts = text.split(/(?<=[.!?।\n])\s+/);
  const chunks: string[] = [];
  let current = '';
  for (const part of parts) {
    if (current && (current.length + part.length + 1) > CHUNK_CHARS) {
      chunks.push(current);
      current = '';
    }
    current = current ? `${current} ${part}` : part;
  }
  if (current) chunks.push(current);
  return chunks;
}

function safeErrorMessage(raw: string): string {
  try {
    return JSON.parse(raw)?.error?.message || raw;
  } catch {
    return raw;
  }
}

// ── Primary path: Sarvam Translate API ────────────────────────────────
// Returns the translated chunk. Throws an Error with `.fallback = true` when the
// API cannot handle the input (unsupported/undetectable source) so the caller
// can retry the chunk through the chat model instead.
async function translateChunkViaApi(chunk: string, targetCode: string): Promise<string> {
  const res = await fetch(`${sarvamOrigin()}/translate`, {
    method: 'POST',
    headers: { 'api-subscription-key': sarvamKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: chunk,
      source_language_code: 'auto',
      target_language_code: targetCode,
    }),
  });

  const raw = await res.text();
  if (res.ok) {
    const data = JSON.parse(raw);
    console.log('[translate:api] ok — target:', targetCode, '| detected:', data?.source_language_code || 'n/a', '| out chars:', (data?.translated_text || '').length);
    return (data?.translated_text || '').trim() || chunk;
  }

  const message = safeErrorMessage(raw);
  console.error('[translate:api] error:', res.status, message);
  // Source already equals the target → the text is already in the target language.
  if (/must be different/i.test(message)) return chunk;
  // Undetectable/unsupported source (e.g. an old Urdu transcript) → chat fallback.
  const err: any = new Error(message);
  err.fallback = true;
  throw err;
}

// ── Fallback path: Sarvam chat with a script-forcing prompt ────────────
function systemPrompt(targetName: string, script: string, isUrdu: boolean): string {
  return (
    `You are a medical translator. Translate the MEANING of the user's consultation transcript into fluent, natural ${targetName}, written in ${script}. ` +
    `The input may be in Urdu, Hindi, English or a mix of these. Translate every sentence into ${targetName} — do not transliterate word for word, and do not leave any sentence in the original language. ` +
    (!isUrdu
      ? `The source is often written in Urdu/Perso-Arabic script; your output must NOT contain any Urdu/Perso-Arabic letters — render everything in ${script}. `
      : '') +
    `Keep medicine names, dosages, numbers, units and lab values accurate; brand medicine names and proper nouns may stay in their standard form. ` +
    `Do not summarise, explain or add anything. Output ONLY the translated transcript — no quotes, notes, headings, or system/prompt text.`
  );
}

function splitInHalf(text: string): [string, string] {
  const mid = Math.floor(text.length / 2);
  let cut = text.lastIndexOf(' ', mid);
  if (cut < MIN_SPLIT_CHARS) cut = text.indexOf(' ', mid);
  if (cut <= 0) cut = mid;
  return [text.slice(0, cut).trim(), text.slice(cut).trim()];
}

// Translate a chunk via chat. `disableThinking` keeps the reasoning trace small so
// the answer fits the token budget; if content still comes back empty, split the
// chunk and translate the halves, then keep the original text as a last resort so
// the transcript is never lost.
async function translateChunkViaChat(chunk: string, system: string): Promise<string> {
  const text = chunk.trim();
  if (!text) return '';
  try {
    const out = await sarvamChat(
      [
        { role: 'system', content: system },
        { role: 'user', content: text },
      ],
      { maxTokens: 4096, reasoningEffort: 'low', disableThinking: true },
    );
    return out.trim();
  } catch (err: any) {
    if (!err?.emptyContent) throw err; // real API/transport error — surface it
    console.error('[translate:chat] empty content (chars:', text.length, ') — retrying smaller');
    if (text.length > MIN_SPLIT_CHARS) {
      const [a, b] = splitInHalf(text);
      return `${await translateChunkViaChat(a, system)} ${await translateChunkViaChat(b, system)}`.trim();
    }
    try {
      const retry = await sarvamChat(
        [
          { role: 'system', content: system },
          { role: 'user', content: text },
        ],
        { maxTokens: 4096, reasoningEffort: 'low', disableThinking: true },
      );
      return retry.trim();
    } catch (retryErr: any) {
      if (!retryErr?.emptyContent) throw retryErr;
      console.error('[translate:chat] still empty after retry — keeping original text');
      return text;
    }
  }
}

/**
 * Translate a transcript into the target language using Sarvam, preserving
 * medical terms, medicine names, dosages and symptoms.
 *
 * "auto" / empty / unknown code → returns the text unchanged (no translation).
 */
export async function translateTranscript(text: string, targetLanguage?: string): Promise<string> {
  const code = (targetLanguage || '').trim().toLowerCase();
  const source = (text || '').trim();

  // Auto Detect (or nothing to translate) → keep the original text.
  if (!code || code === 'auto' || !source) return source;

  const targetName = LANGUAGE_NAMES[code];
  if (!targetName) return source; // unknown code → unchanged

  if (!sarvamKey()) {
    throw new Error('SARVAM_API_KEY is not configured');
  }

  const chatOnly = CHAT_ONLY_TARGETS.has(code);
  const targetCode = TRANSLATE_TARGET[code];
  const system = systemPrompt(targetName, SCRIPT_NAMES[code] || `${targetName} script`, code === 'ur');
  const chunks = chunkTranscript(source);
  console.log('[translate] target:', code, '| chars:', source.length, '| chunks:', chunks.length, '| path:', chatOnly ? 'chat' : 'api');

  // Translate chunks in order and re-join them in the same order.
  const converted: string[] = [];
  for (const chunk of chunks) {
    if (chatOnly) {
      converted.push(await translateChunkViaChat(chunk, system));
      continue;
    }
    try {
      converted.push(await translateChunkViaApi(chunk, targetCode));
    } catch (err: any) {
      if (!err?.fallback) throw err; // real API/transport error — surface it
      console.log('[translate] Translate API could not handle chunk — using chat fallback');
      converted.push(await translateChunkViaChat(chunk, system));
    }
  }

  return converted.join(' ').trim() || source;
}
