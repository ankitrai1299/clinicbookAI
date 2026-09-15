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
  /** Unique for the whole consultation, not just this connection.
   *
   *  The server numbers lines from 1 and starts again on every socket, so after
   *  a reconnect its ids collide with the ones already on screen — line 1 of the
   *  new connection would overwrite line 1 of the old. The epoch below is bumped
   *  per connection so the two can never be mistaken for each other. */
  id: string;
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
  onMeaning: (id: string, text: string) => void;
  onStatus?: (
    status: 'connecting' | 'live' | 'reconnecting' | 'stopped' | 'error',
    detail?: string
  ) => void;
}

// ── Surviving a dropped network ───────────────────────────────────────────
//
// A consultation does not pause because a lift, a thick wall or a mobile
// handover took the connection away for eight seconds. The microphone keeps
// recording into a queue the whole time, the socket reconnects on its own, and
// the queue drains into it — so the transcript catches up rather than losing the
// middle of what the patient said.
//
// The queue is capped. Beyond the cap the LIVE text will have a gap, and that is
// the right trade: the parallel full recording is still running and still
// complete, and a transcript produced from it when the consultation ends is
// better than a browser tab that grew until the phone killed it mid-visit.
const MAX_QUEUE_BYTES = 4 * 60 * CAPTURE_RATE * 2; // ~4 minutes of audio
// Backoff, and deliberately gentle at the start: most outages on a phone are a
// second or two of handover, and an immediate retry catches those before the
// doctor notices anything.
const RETRY_DELAYS_MS = [400, 800, 1500, 3000, 5000, 8000];

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
// The worklet buffers before it posts. process() is called every 128 samples —
// at 48 kHz that is once every 2.7 ms, roughly 375 times a second. A WebSocket
// message that often carries frames smaller than their own headers and spends
// the consultation in the bridge rather than in the microphone. Batching to
// ~85 ms sends about twelve messages a second instead, which is the granularity
// the upstream providers are built around anyway.
const WORKLET_SOURCE = `
const BATCH_SAMPLES = 4096;       // ~85 ms at 48 kHz
class Tap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(BATCH_SAMPLES);
    this.at = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch || !ch.length) return true;
    for (let i = 0; i < ch.length; i++) {
      this.buf[this.at++] = ch[i];
      if (this.at === BATCH_SAMPLES) {
        this.port.postMessage(this.buf.slice(0));
        this.at = 0;
      }
    }
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

  let meaning: MeaningLanguage = opts.meaning ?? 'off';
  let stopped = false;

  // ── The socket, and the queue behind it ────────────────────────────────
  //
  // Audio is produced by the microphone whether or not there is anywhere to send
  // it. Everything the worklet hands over goes into `queue` first and is drained
  // from there, so a socket that is closed, reconnecting, or not open yet costs
  // latency rather than words.
  let ws: WebSocket | null = null;
  let epoch = 0;
  let attempt = 0;
  let queued = 0;
  const queue: ArrayBuffer[] = [];
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const drain = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    while (queue.length) {
      const chunk = queue.shift()!;
      queued -= chunk.byteLength;
      ws.send(chunk);
    }
    queued = 0;
  };

  const enqueue = (chunk: ArrayBuffer) => {
    queue.push(chunk);
    queued += chunk.byteLength;
    // Oldest first. A long outage loses the START of the gap rather than the
    // end, which keeps the words nearest to "now" — the ones the doctor is
    // about to look for on screen.
    while (queued > MAX_QUEUE_BYTES && queue.length) {
      queued -= queue.shift()!.byteLength;
    }
    drain();
  };

  const connect = () => {
    if (stopped) return;
    epoch += 1;
    const myEpoch = epoch;
    handlers.onStatus?.(attempt === 0 ? 'connecting' : 'reconnecting');

    const socket = new WebSocket(socketUrl(token));
    socket.binaryType = 'arraybuffer';
    ws = socket;

    socket.onopen = () => {
      attempt = 0;
      socket.send(JSON.stringify({ type: 'start', meaning }));
      handlers.onStatus?.('live');
      drain();
    };

    socket.onmessage = (ev) => {
      let msg: { type?: string; id?: number; text?: string; language?: string; message?: string };
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      // Namespaced by connection: the server restarts its numbering on every
      // socket, and without this a reconnect would overwrite the lines already
      // on screen.
      const key = `${myEpoch}-${msg.id ?? 0}`;
      if (msg.type === 'partial') return handlers.onPartial(msg.text ?? '');
      if (msg.type === 'final') {
        return handlers.onFinal({ id: key, text: msg.text ?? '', language: msg.language });
      }
      if (msg.type === 'meaning') return handlers.onMeaning(key, msg.text ?? '');
      if (msg.type === 'error') return handlers.onStatus?.('error', msg.message);
    };

    const retry = () => {
      if (stopped || ws !== socket) return;
      const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
      attempt += 1;
      const seconds = Math.round(queued / (CAPTURE_RATE * 2));
      handlers.onStatus?.(
        'reconnecting',
        seconds > 2 ? `Offline — ${seconds}s of audio is held and will be sent.` : undefined
      );
      retryTimer = setTimeout(connect, delay);
    };

    socket.onerror = () => {
      // An error is always followed by a close; reconnecting is handled there so
      // a single drop does not schedule two retries.
    };
    socket.onclose = () => {
      if (stopped || ws !== socket) return;
      retry();
    };
  };

  connect();

  const blobUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }));
  await ctx.audioWorklet.addModule(blobUrl);
  URL.revokeObjectURL(blobUrl);

  const source = ctx.createMediaStreamSource(stream);
  const tap = new AudioWorkletNode(ctx, 'mic-tap');
  // Straight into the queue, never straight onto the socket. Whether there is a
  // connection right now is the queue's problem, not the microphone's.
  tap.port.onmessage = (e: MessageEvent<Float32Array>) => enqueue(toPcm16(e.data, fromRate));
  source.connect(tap);
  // A worklet with no destination is not guaranteed to be pulled. Routing it
  // through a silent gain keeps the graph alive without playing the consultation
  // back into the room, which would be both alarming and a feedback loop.
  const mute = ctx.createGain();
  mute.gain.value = 0;
  tap.connect(mute).connect(ctx.destination);

  // A phone locks, a browser tab goes to the background, and the AudioContext is
  // suspended by the platform — the microphone stops without anything being
  // wrong. Resuming when the page comes back means a doctor who checked a
  // message mid-consultation does not return to a recording that quietly ended.
  const onVisible = () => {
    if (!stopped && ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  };
  document.addEventListener('visibilitychange', onVisible);

  return {
    get active() {
      return !stopped;
    },
    setMeaning(lang: MeaningLanguage) {
      meaning = lang;
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'meaning', language: lang }));
    },
    async stop() {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      document.removeEventListener('visibilitychange', onVisible);

      source.disconnect();
      tap.disconnect();
      mute.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      await ctx.close().catch(() => undefined);

      const socket = ws;
      if (socket?.readyState === WebSocket.OPEN) {
        // Whatever is still queued goes now — those are words already spoken,
        // and they are the last thing a doctor would expect to lose by pressing
        // Stop.
        drain();
        try {
          socket.send(JSON.stringify({ type: 'stop' }));
        } catch {
          /* the socket went away between the check and the send */
        }
        // Left open briefly on purpose: the last sentence is still inside the
        // provider, and closing now would discard the line just spoken.
        setTimeout(() => socket.close(), 4000);
      } else {
        socket?.close();
      }
      ws = null;
      handlers.onStatus?.('stopped');
    }
  };
};
