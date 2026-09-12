// Live transcription via OpenAI's realtime socket.
//
// The primary, because it was the only one that transcribed Hindi, Bhojpuri and
// Bengali correctly WITHOUT being told which it was hearing. See ./types.ts for
// the measurements.
//
// Wire shape confirmed against the live API, not the docs — the beta shape now
// returns "The Realtime Beta API is no longer supported", and the GA shape
// rejects any rate below 24000. Both were found by connecting, not reading.

import WebSocket from 'ws';

import { CAPTURE_RATE, silenceBuffer, type LiveSttHandlers, type LiveSttSession } from './types.js';

const URL = 'wss://api.openai.com/v1/realtime?intent=transcription';

/**
 * gpt-4o-transcribe, not gpt-live-transcribe.
 *
 * Both transcribe correctly. gpt-live-transcribe refuses server-side turn
 * detection — "Turn detection is not supported for this transcription model" —
 * which would put the decision of when a sentence has ended into our code, on
 * audio we cannot hear. A clinic conversation has pauses that are not endings.
 */
const MODEL = (process.env.OPENAI_LIVE_STT_MODEL || '').trim() || 'gpt-4o-transcribe';

export const openaiLiveAvailable = (): boolean => !!(process.env.OPENAI_API_KEY || '').trim();

export const openOpenAiLive = (handlers: LiveSttHandlers): LiveSttSession => {
  const key = (process.env.OPENAI_API_KEY || '').trim();
  if (!key) throw new Error('OPENAI_API_KEY is not configured.');

  const ws = new WebSocket(URL, { headers: { Authorization: `Bearer ${key}` } });
  let ready = false;
  // Audio that arrived before the socket opened. A doctor taps record and speaks
  // immediately; dropping that second loses the opening complaint, which is the
  // sentence the whole note is built around.
  const pending: Buffer[] = [];

  ws.on('open', () => {
    ws.send(
      JSON.stringify({
        type: 'session.update',
        session: {
          type: 'transcription',
          audio: {
            input: {
              format: { type: 'audio/pcm', rate: CAPTURE_RATE },
              transcription: { model: MODEL },
              // No `language`: declaring one is exactly what ruins Sarvam here,
              // and this model's whole advantage is that it does not need to be
              // told. A consultation switches language mid-sentence.
              turn_detection: { type: 'server_vad', silence_duration_ms: 600 }
            }
          }
        }
      })
    );
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
    const type = String(msg.type ?? '');

    if (type === 'error') {
      const e = msg.error as { message?: string } | undefined;
      handlers.onError(new Error(e?.message || 'OpenAI realtime error'));
      return;
    }
    if (type === 'conversation.item.input_audio_transcription.delta') {
      const delta = String(msg.delta ?? '');
      if (delta) handlers.onEvent({ text: delta, final: false });
      return;
    }
    if (type === 'conversation.item.input_audio_transcription.completed') {
      handlers.onEvent({ text: String(msg.transcript ?? ''), final: true });
    }
  });

  ws.on('error', (err: Error) => handlers.onError(err));
  ws.on('close', () => {
    ready = false;
  });

  const send = (pcm24k: Buffer) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: pcm24k.toString('base64') }));
  };

  return {
    provider: 'openai',
    get open() {
      return ws.readyState === WebSocket.OPEN;
    },
    sendAudio(pcm24k: Buffer) {
      if (!ready) {
        // Bounded: ~10 seconds at 24 kHz. A socket that never opens must not
        // grow a buffer until the process dies.
        if (pending.length < 100) pending.push(pcm24k);
        return;
      }
      send(pcm24k);
    },
    close() {
      if (ws.readyState === WebSocket.OPEN) {
        // A last breath of silence so the server's VAD closes the final turn.
        // Without it the last sentence spoken is the one that never arrives —
        // and in a consultation that is usually the plan. It must be LONGER than
        // the configured silence_duration_ms or the provider reads it as a pause.
        send(silenceBuffer(CAPTURE_RATE));
        setTimeout(() => ws.close(), 3000);
        return;
      }
      ws.close();
    }
  };
};
