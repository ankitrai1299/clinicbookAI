// Opening a live transcription session, with a second provider behind the first.
//
// OpenAI leads because it was the only one that read Hindi, Bhojpuri and Bengali
// correctly without being told which it was hearing. Sarvam follows because it
// is excellent when told, and because two vendors failing at once is rarer than
// one. See ./types.ts for the measurements behind both halves of that sentence.

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

/** Which providers this deployment could actually use, in preference order. */
export const availableProviders = (): Array<'openai' | 'sarvam'> => {
  const out: Array<'openai' | 'sarvam'> = [];
  if (openaiLiveAvailable()) out.push('openai');
  if (sarvamLiveAvailable()) out.push('sarvam');
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
