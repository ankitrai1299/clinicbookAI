// Streaming the microphone to our own transcription gateway.
//
// ── What this replaces, and why ───────────────────────────────────────────
//
// The browser's own SpeechRecognition was doing this job. It takes ONE locale,
// chosen before anybody speaks, and "Auto" resolved to en-IN — so a doctor who
// left it alone had Hindi and Bhojpuri transcribed as Indian English, which is
// how the live transcript came to be unusable.
//
// This sends the audio to the backend instead, where it reaches a model that
// identifies the language itself and keeps it. Measured, not assumed:
//
//   said     हमरा पेटवा में दू दिन से बहुत दर्द होत बा, अब बुखार भी लागल बा।
//   meaning  I have had severe stomach pain for two days, and now I also have a fever.
//
// ── The capture rate is not arbitrary ─────────────────────────────────────
//
// 24 kHz, because the upstream provider refuses anything lower and the other one
// wants exactly 16 kHz, which is two thirds of it — an integer ratio the server
// can take without drift. Browsers usually hand back 48 kHz regardless of what
// is asked for, so the resampling below always runs and is never assumed away.

export const CAPTURE_RATE = 24_000;

export interface LiveLine {
  id: number;
  text: string;
  language?: string;
  /** The second row: the same line in the language the doctor reads. */
  meaning?: string;
}

export type MeaningLanguage = 'off' | 'hi' | 'en';

export interface LiveSttHandlers {
  /** The unfinished tail — what is being said right now. */
  onPartial: (text: string) => void;
  /** A finished line. Drug names are already back in Latin by the time it arrives. */
  onFinal: (line: LiveLine) => void;
  /** The meaning of a line, arriving a beat after it. */
  onMeaning: (id: number, text: string) => void;
  onStatus?: (status: 'connecting' | 'live' | 'stopped' | 'error', detail?: string) => void;
}

const socketUrl = (token: string): string => {
  const root = ((import.meta.env.VITE_API_URL as string) || (import.meta.env.VITE_API_BASE_URL as string) || '')
    .replace(/\/+$/, '');
  // Same origin in dev, where the API is proxied and root is empty.
  const base = root || window.location.origin;
  const ws = base.replace(/^http/, 'ws');
  return `${ws}/api/mediscribe/stt/stream?token=${encodeURIComponent(token)}`;
};

/**
 * Float32 [-1, 1] → PCM16 little-endian, resampling to 24 kHz on the way.
 *
 * Linear interpolation rather than nearest-sample. Picking the nearest sample is
 * one line shorter and audibly worse: it jitters the waveform by up to half a
 * sample, which a speech model hears as a rough, breathy edge on every consonant
 * — and consonants are what distinguish one Hindi word from the next.
 */
const toPcm16 = (input: Float32Array, fromRate: number): ArrayBuffer => {
  const ratio = fromRate / CAPTURE_RATE;
  const outLength = Math.floor(input.length / ratio);
  const out = new DataView(new ArrayBuffer(outLength * 2));

  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const left = Math.floor(pos);
    const right = Math.min(left + 1, input.length - 1);
    const frac = pos - left;
    const sample = input[left] * (1 - frac) + input[right] * frac;
    const clamped = Math.max(-1, Math.min(1, sample));
    out.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return out.buffer;
};

/**
 * The audio thread, as a module built at runtime.
 *
 * An AudioWorklet has to be loaded from a URL, and a separate file would have to
 * survive the bundler, the dev server and the production base path — three
 * chances to 404 in a way that only shows up on a doctor's phone. A Blob URL has
 * none of those. ScriptProcessorNode would avoid the question entirely and is
 * deprecated: it runs on the main thread, so every re-render competes with the
 * microphone, and the dropouts land exactly when the screen is busiest.
 */
const WORKLET_SOURCE = `
class Tap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && ch.length) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor('mic-tap', Tap);
`;

export interface LiveSttSession {
  stop: () => Promise<void>;
  setMeaning: (lang: MeaningLanguage) => void;
  readonly active: boolean;
}

/**
 * Start streaming. Resolves once the microphone is open — NOT once the provider
 * has answered, because the doctor has already started talking by then and the
 * audio is buffered on the server side until it is ready.
 */
export const startLiveStt = async (
  handlers: LiveSttHandlers,
  opts: { meaning?: MeaningLanguage } = {}
): Promise<LiveSttSession> => {
  const token = localStorage.getItem('auth_token');
  if (!token) throw new Error('Not signed in.');

  handlers.onStatus?.('connecting');

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  });

  // Ask for 24 kHz; browsers are free to ignore it, which is why the actual rate
  // is read back rather than assumed.
  let ctx: AudioContext;
  try {
    ctx = new AudioContext({ sampleRate: CAPTURE_RATE });
  } catch {
    ctx = new AudioContext();
  }
  const fromRate = ctx.sampleRate;

  const ws = new WebSocket(socketUrl(token));
  ws.binaryType = 'arraybuffer';

  let meaning: MeaningLanguage = opts.meaning ?? 'off';
  let stopped = false;

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'start', meaning }));
    handlers.onStatus?.('live');
  };
  ws.onmessage = (ev) => {
    let msg: { type?: string; id?: number; text?: string; language?: string; message?: string };
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (msg.type === 'partial') return handlers.onPartial(msg.text ?? '');
    if (msg.type === 'final') {
      return handlers.onFinal({ id: msg.id ?? 0, text: msg.text ?? '', language: msg.language });
    }
    if (msg.type === 'meaning') return handlers.onMeaning(msg.id ?? 0, msg.text ?? '');
    if (msg.type === 'error') return handlers.onStatus?.('error', msg.message);
  };
  ws.onerror = () => handlers.onStatus?.('error', 'Live transcription lost its connection.');
  ws.onclose = () => {
    if (!stopped) handlers.onStatus?.('stopped');
  };

  const blobUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }));
  await ctx.audioWorklet.addModule(blobUrl);
  URL.revokeObjectURL(blobUrl);

  const source = ctx.createMediaStreamSource(stream);
  const tap = new AudioWorkletNode(ctx, 'mic-tap');
  tap.port.onmessage = (e: MessageEvent<Float32Array>) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(toPcm16(e.data, fromRate));
  };
  source.connect(tap);
  // A worklet with no destination is not guaranteed to be pulled. Routing it
  // through a silent gain keeps the graph alive without playing the consultation
  // back into the room, which would be both alarming and a feedback loop.
  const mute = ctx.createGain();
  mute.gain.value = 0;
  tap.connect(mute).connect(ctx.destination);

  return {
    get active() {
      return !stopped && ws.readyState === WebSocket.OPEN;
    },
    setMeaning(lang: MeaningLanguage) {
      meaning = lang;
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'meaning', language: lang }));
    },
    async stop() {
      stopped = true;
      try {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'stop' }));
      } catch {
        /* the socket is already gone; nothing to tell it */
      }
      source.disconnect();
      tap.disconnect();
      mute.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      await ctx.close().catch(() => undefined);
      // Left open briefly on purpose: the last sentence is still inside the
      // provider, and closing now would discard the line the doctor just spoke.
      setTimeout(() => ws.close(), 4000);
      handlers.onStatus?.('stopped');
    }
  };
};
