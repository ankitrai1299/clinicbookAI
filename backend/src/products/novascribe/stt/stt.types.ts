// Speech-to-Text provider contract. Everything behind this interface is
// swappable: today a local mock, tomorrow Sarvam (Indian languages / code-mix),
// Whisper large-v3, Deepgram (fast + diarization) or Azure Speech (medical
// vocab) — selected per language/quality WITHOUT touching pipeline code.

export interface TranscriptSegment {
  // Diarization (V2): which speaker said this. 'doctor' | 'patient' | 'unknown'.
  speaker?: string;
  text: string;
  startSec?: number;
  endSec?: number;
  confidence?: number; // 0..1
}

export interface SttResult {
  text: string; // full transcript
  language?: string; // detected/declared (ISO-639-1)
  durationSec?: number;
  segments?: TranscriptSegment[];
}

export interface SttInput {
  audio: Buffer;
  mimeType?: string;
  // ISO-639-1 hint ('hi', 'en', 'mr', 'ta') or '' to auto-detect. For Indian
  // code-mixed speech a hint usually beats auto-detect.
  languageHint?: string;
}

export interface SttProvider {
  readonly name: string;
  transcribe(input: SttInput): Promise<SttResult>;
}
