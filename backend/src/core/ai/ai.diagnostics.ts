// Does the AI actually work right now?
//
// ── Why a real call and not a config check ────────────────────────────────
//
// The OpenAI account ran out of credit and nothing noticed for three days. The
// key was present, every config check passed, and the failure arrived per
// utterance as `input_audio_transcription.failed` — so live transcription,
// WhatsApp voice notes, the AI receptionist and the intent router were all dead
// while the server reported itself healthy.
//
// A key being set says nothing about whether it can be used. So this spends a
// handful of tokens on a real request at boot and says plainly which of the two
// it is. Neither provider offers a balance endpoint — Sarvam has no /usage or
// /credits route, only /v1/models — so a real call is the only honest test.
//
// It never blocks startup and never throws. A clinic's booking flow does not
// stop because a diagnostic could not reach an API.

import { aiClient, aiModel, aiProvider, isAiConfigured } from './provider.js';

/** A tiny, cheap round trip. Ten tokens is enough to prove a key can be spent. */
const PROBE_TIMEOUT_MS = 15_000;

export const checkAi = async (): Promise<{ ok: boolean; detail: string }> => {
  const provider = aiProvider();
  if (!isAiConfigured()) {
    return {
      ok: false,
      detail:
        provider === 'sarvam'
          ? 'SARVAM_API_KEY is not set — transcription, voice notes and the AI receptionist are all off.'
          : 'OPENAI_API_KEY is not set.'
    };
  }

  try {
    const res = await aiClient().chat.completions.create(
      {
        model: aiModel(),
        max_tokens: 5,
        temperature: 0,
        messages: [{ role: 'user', content: 'ok' }]
      },
      { timeout: PROBE_TIMEOUT_MS }
    );
    const answered = Boolean(res.choices?.[0]?.message);
    return answered
      ? { ok: true, detail: `${provider} (${aiModel()}) answered.` }
      : { ok: false, detail: `${provider} accepted the request but returned nothing.` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // The one worth naming, because it is invisible everywhere else and it is
    // what actually happened.
    const quota = /quota|credit|balance|billing|insufficient|402|429/i.test(message);
    return {
      ok: false,
      detail: quota
        ? `${provider} REFUSED THE REQUEST — out of credit or over quota. Every AI feature is down until this is topped up. (${message.slice(0, 160)})`
        : `${provider} unreachable: ${message.slice(0, 200)}`
    };
  }
};

/**
 * Boot banner. Mirrors the WhatsApp and email banners so a deploy log says, in
 * one place, whether the things a clinic depends on are actually working.
 */
export const logAiStartupInfo = async (): Promise<void> => {
  const { ok, detail } = await checkAi();
  if (ok) console.info(`[ai] ${detail}`);
  else console.error(`[ai] NOT WORKING — ${detail}`);
};
