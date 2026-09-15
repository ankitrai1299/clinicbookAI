// Opening a live transcription session.
//
// ── Sarvam only, by decision and by measurement ───────────────────────────
//
// OpenAI led here until 15 Sep 2026. Three things moved it aside, in order of
// weight:
//
//   1. The account ran out of credit, and every transcription failed. That is a
//      business fact rather than a technical one, but a pipeline that stops when
//      a card expires is not a pipeline a clinic can run on.
//   2. ABDM's audit checklist requires that no data leaves India. Sarvam is an
//      Indian company; routing consultation audio to OpenAI is a question we
//      would have to answer for, and the easiest answer is not to.
//   3. The gap that justified OpenAI closed. It was chosen because Sarvam's
//      auto-detect once returned "Doctor, sorry, sorry, sorry…" on Hindi. Re-run
//      on 15 Sep against the same kind of audio, Sarvam on `auto` matched being
//      told the language exactly — Hindi 10% WER, Bhojpuri 13%, Bengali 0%.
//
// Point 3 is a reversal of an earlier measurement, and it is recorded rather
// than quietly overwritten: either the provider improved or that failure is
// intermittent. The benchmark exists to catch it if it returns.
//
// OpenAI is not deleted. Set LIVE_STT_PROVIDER=openai to use it, which is how
// the two get compared again without rewriting this file.

import { openOpenAiLive, openaiLiveAvailable } from './openaiLive.js';
import { openSarvamLive, sarvamLiveAvailable } from './sarvamLive.js';
import type { LiveSttHandlers, LiveSttSession } from './types.js';

export { downsample24to16, CAPTURE_RATE, SARVAM_RATE } from './types.js';
export type { LiveSttEvent, LiveSttHandlers, LiveSttSession } from './types.js';
export { sarvamLanguageFor } from './sarvamLive.js';

export interface LiveSttOptions {
  /** Passed to Sarvam only. OpenAI is deliberately told nothing — see openaiLive. */
  languageHint?: string;
  /** Force one provider. For diagnosis; the default is the failover chain. */
  only?: 'openai' | 'sarvam';
}

/**
 * Which providers this deployment could actually use, in preference order.
 *
 * Sarvam first. OpenAI appears only when asked for by name — see the note above
 * — and then only as the fallback, so a stray key in the environment cannot
 * quietly start sending Indian consultation audio out of the country.
 */
export const availableProviders = (): Array<'openai' | 'sarvam'> => {
  const preferOpenAi = (process.env.LIVE_STT_PROVIDER || '').trim().toLowerCase() === 'openai';
  const out: Array<'openai' | 'sarvam'> = [];
  if (preferOpenAi && openaiLiveAvailable()) out.push('openai');
  if (sarvamLiveAvailable()) out.push('sarvam');
  if (!out.length && openaiLiveAvailable()) out.push('openai');
  return out;
};

/**
 * Open a session, moving to the next provider if the first one fails to carry it.
 *
 * The failover has one rule that matters: it only fires while NOTHING HAS BEEN
 * TRANSCRIBED YET. Once a word has reached the doctor's screen, switching
 * provider mid-consultation would restart the utterance somewhere else and
 * duplicate or drop the sentence around the seam. A late failure is reported
 * instead, and the doctor keeps the transcript they already have — the recording
 * itself is still saved and still goes through the full-audio pass at the end,
 * which is the real safety net.
 */
export const openLiveStt = (handlers: LiveSttHandlers, opts: LiveSttOptions = {}): LiveSttSession => {
  const chain = opts.only ? [opts.only] : availableProviders();
  if (!chain.length) {
    throw new Error('Live transcription is not configured: set OPENAI_API_KEY or SARVAM_API_KEY.');
  }

  let index = 0;
  let produced = false;
  let current: LiveSttSession | null = null;
  let closed = false;
  // Everything sent so far, replayed into the replacement so a failover at
  // second three does not lose the first three seconds of the consultation.
  const sent: Buffer[] = [];
  const MAX_REPLAY = 150; // ~15 s at 100 ms frames; a failover after that is not a start

  const start = (): LiveSttSession => {
    const provider = chain[index];
    const inner: LiveSttHandlers = {
      onOpen: handlers.onOpen,
      onEvent: (e) => {
        if (e.text) produced = true;
        handlers.onEvent(e);
      },
      onError: (err) => {
        const canRetry = !produced && !closed && index + 1 < chain.length;
        if (!canRetry) {
          handlers.onError(err);
          return;
        }
        console.warn(
          `[liveStt] ${provider} failed before transcribing anything (${err.message}); trying ${chain[index + 1]}`
        );
        index += 1;
        try {
          current = start();
          for (const b of sent) current.sendAudio(b);
        } catch (e) {
          handlers.onError(e as Error);
        }
      }
    };

    return provider === 'openai' ? openOpenAiLive(inner) : openSarvamLive(inner, opts.languageHint);
  };

  current = start();

  return {
    get provider() {
      return current?.provider ?? chain[0];
    },
    get open() {
      return !!current?.open;
    },
    sendAudio(pcm24k: Buffer) {
      if (!produced && sent.length < MAX_REPLAY) sent.push(pcm24k);
      current?.sendAudio(pcm24k);
    },
    close() {
      closed = true;
      sent.length = 0;
      current?.close();
    }
  };
};
