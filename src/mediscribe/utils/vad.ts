// ── Voice Activity Detection (VAD) ────────────────────────────────────────
// Lightweight, provider-agnostic speech-activity detector built on the Web Audio
// API (AnalyserNode). It watches the microphone stream's energy and reports when
// real speech is happening, so callers can:
//   • start/resume transcribing immediately when the doctor speaks, and
//   • ignore brief accidental sounds (keyboard clicks, a single cough, fan/AC
//     hum, short knocks) that are NOT sustained speech.
//
// It is intentionally additive and non-destructive: it never touches the audio,
// never stops the recording, and — if the browser lacks AudioContext or setup
// fails — callers should treat every chunk as speech (fail-open) so no real word
// is ever lost. The recording keeps running through pauses; the VAD only tells
// you whether the current sound is speech or silence/noise.

export interface VADOptions {
  /** RMS energy (0..1) above which a frame counts as voiced. Low = sensitive. */
  speechThreshold?: number;
  /** Sustained voiced time (ms) required before speech is confirmed. Filters out
   *  brief clicks/coughs/knocks that spike energy for only a moment. */
  minSpeechMs?: number;
  /** Continuous silence (ms) after which speech is considered ended (a pause). */
  silenceMs?: number;
  /** How often to sample the mic energy (ms). */
  frameMs?: number;
  /** Fired once when sustained speech begins (fast start / resume). */
  onSpeechStart?: () => void;
  /** Fired once when a pause (sustained silence) begins. */
  onSpeechEnd?: () => void;
}

export interface VADController {
  /** True while sustained speech is currently detected. */
  isSpeaking(): boolean;
  /** True if confirmed speech occurred within the last `windowMs` (default 1500). */
  spokeRecently(windowMs?: number): boolean;
  /** Tear down the analyser/timer and release the audio graph. */
  stop(): void;
}

const DEFAULTS: Required<Omit<VADOptions, 'onSpeechStart' | 'onSpeechEnd'>> = {
  speechThreshold: 0.015, // ~ -36 dBFS RMS; low enough for soft speech
  minSpeechMs: 150,       // ignore sub-150 ms bursts (clicks/coughs)
  silenceMs: 600,         // a real conversational pause
  frameMs: 50,
};

/**
 * Attach a VAD to a live MediaStream. Returns a controller, or a no-op
 * fail-open controller (spokeRecently → always true) if Web Audio is
 * unavailable so callers never suppress real speech.
 */
export function createVAD(stream: MediaStream, opts: VADOptions = {}): VADController {
  const cfg = { ...DEFAULTS, ...opts };

  const Ctx: typeof AudioContext | undefined =
    (window as any).AudioContext || (window as any).webkitAudioContext;

  // Fail-open: no Web Audio (or no stream) → treat everything as speech.
  if (!Ctx || !stream || stream.getAudioTracks().length === 0) {
    return {
      isSpeaking: () => true,
      spokeRecently: () => true,
      stop: () => {},
    };
  }

  let audioCtx: AudioContext;
  let source: MediaStreamAudioSourceNode;
  let analyser: AnalyserNode;
  try {
    audioCtx = new Ctx();
    source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    // NOTE: analyser is intentionally NOT connected to destination, so we never
    // play the mic back to the speakers.
  } catch {
    return {
      isSpeaking: () => true,
      spokeRecently: () => true,
      stop: () => {},
    };
  }

  const buffer = new Uint8Array(analyser.fftSize);
  let speaking = false;
  let voicedMs = 0;       // consecutive voiced time in the current burst
  let silenceRun = 0;     // consecutive silent time
  let lastSpeechTs = 0;   // wall-clock of the most recent confirmed voiced frame

  const timer = setInterval(() => {
    analyser.getByteTimeDomainData(buffer);
    // RMS of the centred waveform (0..1).
    let sumSq = 0;
    for (let i = 0; i < buffer.length; i++) {
      const v = (buffer[i] - 128) / 128;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / buffer.length);

    if (rms >= cfg.speechThreshold) {
      voicedMs += cfg.frameMs;
      silenceRun = 0;
      // Confirm speech only once energy has been sustained — this is what
      // rejects momentary clicks/coughs/knocks.
      if (voicedMs >= cfg.minSpeechMs) {
        lastSpeechTs = Date.now();
        if (!speaking) {
          speaking = true;
          opts.onSpeechStart?.();
        }
      }
    } else {
      silenceRun += cfg.frameMs;
      voicedMs = 0;
      if (speaking && silenceRun >= cfg.silenceMs) {
        speaking = false;
        opts.onSpeechEnd?.();
      }
    }
  }, cfg.frameMs);

  return {
    isSpeaking: () => speaking,
    spokeRecently: (windowMs = 1500) =>
      lastSpeechTs > 0 && Date.now() - lastSpeechTs <= windowMs,
    stop: () => {
      clearInterval(timer);
      try { source.disconnect(); } catch { /* noop */ }
      try { analyser.disconnect(); } catch { /* noop */ }
      try { void audioCtx.close(); } catch { /* noop */ }
    },
  };
}
