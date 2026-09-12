// Live speech-to-text: one shape, two providers.
//
// ── What the probes showed, because it decided this design ────────────────
//
// Both providers' realtime sockets were run against the real keys before any of
// this was written, with Sarvam's own text-to-speech generating the samples. The
// documentation was not enough: two Sarvam doc pages describe different wire
// formats, and neither warns about what actually matters.
//
//   Sarvam, language_code=hi-IN   डॉक्टर साहब दो दिन से पेट में तेज़ दर्द है
//   Sarvam, language_code=auto    "Doctor, sorry, sorry, sorry, sorry…"
//
// Sarvam's auto-detect heard Hindi as Indian English and produced repetition —
// the classic wrong-language failure. It is excellent when told the language and
// unusable when not, and a clinic cannot be asked to declare the language before
// the patient has opened their mouth.
//
//   OpenAI gpt-4o-transcribe, nothing declared
//     Hindi      डॉक्टर साहब, दो दिन से पेट में तेज़ दर्द है और बुखार भी आ रहा है।
//     Bhojpuri   हमरा पेटवा में दू दिन से बहुत दर्द होत बा, आ बुखार भी लागल बा
//     Bengali    আমার দুই দিন ধরে পেটে খুব ব্যথা হচ্ছে আর জ্বর আসছে।
//
// The Bhojpuri one settled it. It kept Bhojpuri grammar — होत बा, लागल बा, पेटवा,
// दू — rather than flattening it into Hindi. That is the requirement, verbatim:
// what was said, in the language it was said in.
//
// So OpenAI leads and Sarvam follows. Not a preference — the measurement.
//
// ── The sample rates differ, and that is structural ───────────────────────
//
//   Sarvam  16000 Hz exactly
//   OpenAI  24000 Hz minimum ("integer below minimum value", verbatim)
//
// So capture is 24000 and Sarvam is fed a 3:2 decimation of it. Capturing at
// 16000 and upsampling for OpenAI would invent nothing and lose the top octave
// of every consonant, which is where Indian-language ASR lives.

/** A live transcript fragment. `final` means the provider will not revise it. */
export interface LiveSttEvent {
  text: string;
  final: boolean;
  /** BCP-47 as the provider detected it, when it says. Never guessed here. */
  language?: string;
}

export interface LiveSttHandlers {
  onEvent: (e: LiveSttEvent) => void;
  /** Fatal for this provider — the caller decides whether to fail over. */
  onError: (err: Error) => void;
  onOpen?: () => void;
}

export interface LiveSttSession {
  /** Which provider is actually carrying this session. */
  readonly provider: 'openai' | 'sarvam';
  /** 24 kHz mono PCM16, exactly as captured. Resampling belongs to the adapter. */
  sendAudio(pcm24k: Buffer): void;
  /** Ask for whatever is still buffered, then stop. */
  close(): void;
  readonly open: boolean;
}

/** Capture rate. Fixed, and both adapters are written against it. */
export const CAPTURE_RATE = 24_000;
export const SARVAM_RATE = 16_000;

/**
 * 24 kHz → 16 kHz, by averaging each group of three input samples into two.
 *
 * The ratio is exactly 3:2, which is why 24000 was chosen as the capture rate
 * rather than 44100 or 48000: the conversion is small, integer-aligned and has
 * no phase drift to accumulate over a twenty-minute consultation.
 *
 * Averaging rather than dropping samples. Dropping every third sample is a
 * one-line decimation that aliases: the discarded energy folds back down into
 * the speech band as a metallic edge, and it lands worst on fricatives — स, श,
 * ph, kh — which is precisely what separates one Hindi word from another.
 */
export const downsample24to16 = (pcm24k: Buffer): Buffer => {
  const inSamples = Math.floor(pcm24k.length / 2);
  const groups = Math.floor(inSamples / 3);
  const out = Buffer.alloc(groups * 2 * 2);

  for (let g = 0; g < groups; g++) {
    const a = pcm24k.readInt16LE((g * 3 + 0) * 2);
    const b = pcm24k.readInt16LE((g * 3 + 1) * 2);
    const c = pcm24k.readInt16LE((g * 3 + 2) * 2);
    // Two output samples per three input: weighted toward the nearer neighbours.
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round((a * 2 + b) / 3))), (g * 2 + 0) * 2);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round((b + c * 2) / 3))), (g * 2 + 1) * 2);
  }
  return out;
};

/**
 * Trailing silence sent when a recording stops, so the provider's voice-activity
 * detector decides the last utterance has ended and releases it.
 *
 * 1200 ms, and the number is load-bearing. OpenAI's turn detection is configured
 * with silence_duration_ms: 600, so anything at or under that is not silence to
 * it — it is a pause. Half a second was tried first: the socket closed with the
 * final sentence still inside the provider, and in a consultation the final
 * sentence is usually the plan.
 */
export const CLOSING_SILENCE_MS = 1200;

/** That much silence as PCM16 mono at a given rate. */
export const silenceBuffer = (rate: number): Buffer =>
  Buffer.alloc(Math.round((rate * CLOSING_SILENCE_MS) / 1000) * 2);
