// Streaming the phone's microphone to our own transcription gateway.
//
// ── What this replaces ────────────────────────────────────────────────────
//
// Live transcription on the phone was Android's own recogniser, which takes ONE
// locale chosen before anybody speaks — and "Auto" resolved to en-IN. A doctor
// who left it alone had Hindi and Bhojpuri transcribed as Indian English. That
// is the whole reason the live transcript was unusable.
//
// The audio now goes to the backend, which holds the provider key and reaches a
// model that identifies the language itself and keeps it. Measured against
// production before this file was written:
//
//   said     हमरा पेटवा में दू दिन से बहुत दर्द होता बा आ बुखार भी लागल बा.
//   meaning  I have had severe stomach pain for two days along with a fever.
//
// ── Why 48 kHz in and 24 kHz out ──────────────────────────────────────────
//
// The gateway takes 24 kHz: one provider refuses anything lower, the other wants
// exactly 16 kHz, and 24 divides cleanly into both. The recorder cannot produce
// 24 kHz — its sample rates are 16000, 44100 and 48000 — so it records at 48 and
// this halves it. Two-to-one, the one resampling ratio with nothing to get
// wrong: each output sample is the average of an adjacent pair.
//
// Recording at 16 kHz instead would have to be scaled UP for the provider, which
// invents nothing and permanently discards the top of every consonant — exactly
// what tells one Hindi word from another.
//
// A hook rather than a service, because the recorder is one: `useAudioRecorder`
// owns the native session, and reaching it from a plain module would mean a
// second copy of that state.

import { useCallback, useRef, useState } from 'react';
import { useAudioRecorder } from '@siteed/expo-audio-studio';

import { API_ROOT } from '../config';
import { getSessionToken } from '../services/api';

export interface LiveLine {
  id: number;
  text: string;
  language?: string;
  /** The second row: the same line in the language the doctor reads. */
  meaning?: string;
}

export type MeaningLanguage = 'off' | 'hi' | 'en';

const RECORD_RATE = 48_000;

/**
 * Base64 PCM16 at 48 kHz → an ArrayBuffer of PCM16 at 24 kHz.
 *
 * Averaging each adjacent pair rather than keeping every second sample. Keeping
 * one and discarding the other is a line shorter and aliases: the discarded
 * energy folds back into the speech band as a metallic edge, hardest on
 * fricatives — स, श, ph, kh — which is where Indian-language recognition is
 * decided.
 */
export const halveTo24k = (base64: string): ArrayBuffer => {
  const bin = globalThis.atob(base64);
  const inSamples = Math.floor(bin.length / 2);
  const outSamples = Math.floor(inSamples / 2);
  const out = new DataView(new ArrayBuffer(outSamples * 2));

  const sampleAt = (i: number): number => {
    const v = bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8);
    return v >= 0x8000 ? v - 0x10000 : v;
  };

  for (let i = 0; i < outSamples; i++) {
    out.setInt16(i * 2, Math.round((sampleAt(i * 2) + sampleAt(i * 2 + 1)) / 2), true);
  }
  return out.buffer;
};

export interface LiveStt {
  lines: LiveLine[];
  partial: string;
  note: string | null;
  isLive: boolean;
  meaning: MeaningLanguage;
  setMeaning: (lang: MeaningLanguage) => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  reset: () => void;
}

export const useLiveStt = (): LiveStt => {
  const recorder = useAudioRecorder();
  const [lines, setLines] = useState<LiveLine[]>([]);
  const [partial, setPartial] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [meaning, setMeaningState] = useState<MeaningLanguage>('off');

  const wsRef = useRef<WebSocket | null>(null);
  const meaningRef = useRef<MeaningLanguage>('off');
  const stoppedRef = useRef(false);

  const setMeaning = useCallback((lang: MeaningLanguage) => {
    meaningRef.current = lang;
    setMeaningState(lang);
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'meaning', language: lang }));
    }
  }, []);

  const reset = useCallback(() => {
    setLines([]);
    setPartial('');
    setNote(null);
  }, []);

  const start = useCallback(async () => {
    const token = getSessionToken();
    if (!token) throw new Error('Not signed in.');

    stoppedRef.current = false;
    reset();

    const ws = new WebSocket(
      `${API_ROOT.replace(/^http/, 'ws')}/api/mediscribe/stt/stream?token=${encodeURIComponent(token)}`
    );
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'start', meaning: meaningRef.current }));
      setIsLive(true);
      setNote(null);
    };
    ws.onmessage = (ev: WebSocketMessageEvent) => {
      let msg: { type?: string; id?: number; text?: string; language?: string; message?: string };
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.type === 'partial') return setPartial(msg.text ?? '');
      if (msg.type === 'final') {
        setPartial('');
        setLines((prev) => [...prev, { id: msg.id ?? 0, text: msg.text ?? '', language: msg.language }]);
        return;
      }
      if (msg.type === 'meaning') {
        const { id, text } = msg;
        return setLines((prev) => prev.map((l) => (l.id === id ? { ...l, meaning: text } : l)));
      }
      // The vendor's own words never reach the doctor — mid-consultation they
      // are noise nobody can act on. The gateway already replaced them with a
      // sentence that says what to expect.
      if (msg.type === 'error') return setNote(msg.message ?? 'Live transcription stopped.');
    };
    ws.onerror = () => setNote('Live transcription lost its connection.');
    ws.onclose = () => {
      setIsLive(false);
      if (!stoppedRef.current) setNote('Live transcription stopped. The recording is still being saved.');
    };

    await recorder.startRecording({
      sampleRate: RECORD_RATE,
      channels: 1,
      encoding: 'pcm_16bit',
      // 100 ms per callback. Longer batches the words into visible jumps;
      // shorter spends more time crossing the bridge than in the microphone.
      interval: 100,
      onAudioStream: async (event) => {
        const socket = wsRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        if (typeof event.data !== 'string') return;
        try {
          socket.send(halveTo24k(event.data));
        } catch {
          /* a frame lost to a closing socket is not worth an error on screen */
        }
      }
    });
  }, [recorder, reset]);

  const stop = useCallback(async () => {
    stoppedRef.current = true;
    setIsLive(false);
    setPartial('');
    try {
      await recorder.stopRecording();
    } catch {
      /* already stopped */
    }
    const ws = wsRef.current;
    try {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'stop' }));
    } catch {
      /* the socket is already gone; nothing to tell it */
    }
    // Left open briefly on purpose: the last sentence is still inside the
    // provider, and closing now would discard the line just spoken — which in a
    // consultation is usually the plan.
    setTimeout(() => {
      try {
        ws?.close();
      } catch {
        /* noop */
      }
      wsRef.current = null;
    }, 4000);
  }, [recorder]);

  return { lines, partial, note, isLive, meaning, setMeaning, start, stop, reset };
};
