// Transcription languages — identical list/codes to the web app. "auto" lets
// Whisper auto-detect (the backend maps unmapped/"auto" to no forced language).
export const LANGUAGES: { code: string; label: string }[] = [
  { code: 'auto', label: 'Auto Detect' },
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ta', label: 'Tamil' },
  { code: 'te', label: 'Telugu' },
  { code: 'bn', label: 'Bengali' },
  { code: 'mr', label: 'Marathi' },
  { code: 'gu', label: 'Gujarati' },
  { code: 'kn', label: 'Kannada' },
  { code: 'ml', label: 'Malayalam' },
  { code: 'pa', label: 'Punjabi' },
];

// Map a language code to the display label the backend expects in the
// `language` form field (it accepts the display name or code; web sends label).
export const languageLabel = (code: string): string =>
  LANGUAGES.find((l) => l.code === code)?.label || 'Auto Detect';

// Phrases Whisper commonly hallucinates on silent/unclear audio. Mirrors the
// web app's guard so we never insert filler text into the transcript.
const HALLUCINATION_PHRASES = [
  'thank you for watching',
  'thanks for watching',
  'for more information',
  'visit www',
  'subscribe',
  'cst.eu.com',
  'www.cst',
  'isglobal',
];

export function isLikelyHallucination(text: string): boolean {
  const lower = text.toLowerCase();
  return HALLUCINATION_PHRASES.some((p) => lower.includes(p));
}
