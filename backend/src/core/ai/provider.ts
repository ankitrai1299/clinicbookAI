// Which AI provider the whole backend talks to.
//
// ── One switch, not seven ─────────────────────────────────────────────────
//
// Sarvam speaks the OpenAI chat protocol, so the OpenAI SDK works against it
// unchanged — only the base URL, the key and the model differ. That makes this
// file the entire migration: every caller keeps its prompts, its tool
// definitions and its parsing, and none of them needs to know.
//
// Proven before it was written, because "OpenAI-compatible" is a claim vendors
// make at different depths. The booking agent depends on tool calling, so that
// is what was checked:
//
//   POST https://api.sarvam.ai/v1/chat/completions   with tools: [book_appointment]
//   → {"name":"book_appointment","arguments":"{\"doctor\":\"Dr Rai\",\"time\":\"tomorrow at 3:00 PM\"}"}
//
// A real tool call, correctly parsed. Breaking the booking flow would have cost
// more than the transcription ever did.
//
// ── Why the move ──────────────────────────────────────────────────────────
//
// The OpenAI account ran out of credit, which took live transcription, WhatsApp
// voice notes, the AI receptionist and the intent router down together. And
// ABDM's audit checklist requires that no data leaves India — Sarvam is an
// Indian company, so this is one fewer question to answer at certification.
//
// OpenAI is not removed. AI_PROVIDER=openai restores it everywhere at once,
// which is how the two get compared again without editing seven files.

import OpenAI from 'openai';

import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';

const SARVAM_BASE_URL = 'https://api.sarvam.ai/v1';

export type AiProvider = 'sarvam' | 'openai';

const sarvamKey = (): string => (process.env.SARVAM_API_KEY || '').trim();

/**
 * Sarvam unless told otherwise, and never a silent fall back to OpenAI.
 *
 * If Sarvam is chosen and unconfigured the caller gets an error naming the
 * missing variable. Quietly reaching for the other provider would send Indian
 * consultation audio and patient conversations abroad because somebody forgot
 * to set a key — a decision that should never be made by an accident.
 */
export const aiProvider = (): AiProvider =>
  (process.env.AI_PROVIDER || '').trim().toLowerCase() === 'openai' ? 'openai' : 'sarvam';

/** True when the chosen provider is actually usable. */
export const isAiConfigured = (): boolean =>
  aiProvider() === 'openai' ? Boolean(env.OPENAI_API_KEY) : Boolean(sarvamKey());

/**
 * The default chat model for the chosen provider.
 *
 * SARVAM_MODEL exists because Sarvam retires models without warning —
 * 'sarvam-30b' was the default until it was deprecated mid-flight and every
 * report generation began failing. The override makes the next retirement a
 * config change on the host rather than a deploy.
 */
export const aiModel = (): string =>
  aiProvider() === 'openai'
    ? (process.env.OPENAI_MODEL || '').trim() || 'gpt-4.1-mini'
    : (process.env.SARVAM_MODEL || '').trim() || 'sarvam-105b';

/** An OpenAI-SDK client pointed at whichever provider is in charge. */
export const aiClient = (): OpenAI => {
  if (aiProvider() === 'openai') {
    if (!env.OPENAI_API_KEY) {
      throw new AppError('AI is not configured. Add OPENAI_API_KEY to backend/.env', 503);
    }
    return new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  const key = sarvamKey();
  if (!key) {
    throw new AppError('AI is not configured. Add SARVAM_API_KEY to backend/.env', 503);
  }
  return new OpenAI({ apiKey: key, baseURL: SARVAM_BASE_URL });
};

/**
 * Extra body fields the provider wants.
 *
 * Sarvam's models always reason, and the reasoning trace shares the same token
 * budget as the answer — on a small budget it can consume the whole thing and
 * return empty content. Off by default for the short, structured answers this
 * backend asks for; a caller that wants deliberation can pass its own.
 */
export const aiExtras = (): Record<string, unknown> =>
  aiProvider() === 'sarvam'
    ? { reasoning_effort: 'low', chat_template_kwargs: { enable_thinking: false } }
    : {};
