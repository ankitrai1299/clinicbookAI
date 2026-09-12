// Live transcription via Sarvam's realtime socket.
//
// The fallback, and a good one — WHEN it is told the language. Given hi-IN it
// returned the sample sentence perfectly; given language_code=auto it heard
// Hindi as Indian English and produced "Doctor, sorry, sorry, sorry…". See
// ./types.ts for the full measurement.
//
// So this adapter takes a language and defaults to Hindi rather than to auto.
// Defaulting to auto would mean the failover path degrades into nonsense at the
// exact moment the primary is already down — a fallback that fails quietly is
// worse than none, because nobody looks.

import WebSocket from 'ws';

import { downsample24to16, type LiveSttHandlers, type LiveSttSession } from './types.js';
import { sarvamKey } from '../sarvam.js';

const MODEL = 'saaras:v3-realtime';

/** Sarvam's realtime language codes, as its own session.begin echoes them. */
const KNOWN = new Set([
  'en-IN', 'hi-IN', 'bn-IN', 'ta-IN', 'te-IN', 'kn-IN', 'ml-IN', 'mr-IN',
  'gu-IN', 'pa-IN', 'or-IN', 'ur-IN', 'as-IN', 'mai-IN', 'ne-IN', 'sa-IN'
]);

/**
 * Hindi unless told otherwise, and never 'auto'.
 *
 * Hindi is the least-bad default for a clinic in this market: it is the most
 * likely language, and the closest relative of the ones this model does not
 * list — Bhojpuri, Awadhi, Magahi all share its script and much of its
 * vocabulary, so a Hindi model degrades gracefully on them where an English one
 * collapses.
 */
export const sarvamLanguageFor = (hint?: string): string => {
  const v = (hint || '').trim();
  if (!v || v.toLowerCase() === 'auto') return 'hi-IN';
  if (KNOWN.has(v)) return v;
  const withRegion = `${v.toLowerCase()}-IN`;
  return KNOWN.has(withRegion) ? withRegion : 'hi-IN';
};

export const sarvamLiveAvailable = (): boolean => !!sarvamKey();

export const openSarvamLive = (handlers: LiveSttHandlers, languageHint?: string): LiveSttSession => {
  const key = sarvamKey();
  if (!key) throw new Error('SARVAM_API_KEY is not configured.');

  const language = sarvamLanguageFor(languageHint);
  const url = `wss://api.sarvam.ai/speech-to-text-realtime/ws?model=${encodeURIComponent(
    MODEL
  )}&language_code=${encodeURIComponent(language)}`;

  const ws = new WebSocket(url, { headers: { 'api-subscription-key': key } });
  let ready = false;
  const pending: Buffer[] = [];

  // Sarvam re-sends the WHOLE utterance in every partial, growing as it goes.
  // Emitting those verbatim would repeat the sentence on screen, so only the
  // newly-added tail is passed on and the caller appends as it would for OpenAI.
  let lastPartial = '';

  const send = (pcm24k: Buffer) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({ event: 'audio_input', audio: downsample24to16(pcm24k).toString('base64') })
    );
  };

  ws.on('open', () => {
    ready = true;
    for (const b of pending.splice(0)) send(b);
    handlers.onOpen?.();
  });

  ws.on('message', (raw) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const event = String(msg.event ?? '');

    if (event === 'error') {
      handlers.onError(new Error(String((msg as { message?: string }).message || 'Sarvam realtime error')));
      return;
    }
    if (event === 'transcript.partial') {
      const text = String(msg.text ?? '');
      if (text.startsWith(lastPartial)) {
        const tail = text.slice(lastPartial.length);
        if (tail) handlers.onEvent({ text: tail, final: false, language: str(msg.language) });
      } else if (text) {
        // A revision rather than a continuation. Nothing partial can be trusted
        // to have been appended, so the caller is told the whole thing afresh.
        handlers.onEvent({ text, final: false, language: str(msg.language) });
      }
      lastPartial = text;
      return;
    }
    if (event === 'transcript.final') {
      lastPartial = '';
      handlers.onEvent({ text: String(msg.text ?? ''), final: true, language: str(msg.language) });
    }
  });

  ws.on('error', (err: Error) => handlers.onError(err));
  ws.on('close', () => {
    ready = false;
  });

  return {
    provider: 'sarvam',
    get open() {
      return ws.readyState === WebSocket.OPEN;
    },
    sendAudio(pcm24k: Buffer) {
      if (!ready) {
        if (pending.length < 100) pending.push(pcm24k);
        return;
      }
      send(pcm24k);
    },
    close() {
      if (ws.readyState === WebSocket.OPEN) {
        send(Buffer.alloc(24_000)); // silence, so the VAD closes the last turn
        setTimeout(() => ws.close(), 1500);
        return;
      }
      ws.close();
    }
  };
};

const str = (v: unknown): string | undefined => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s || undefined;
};
