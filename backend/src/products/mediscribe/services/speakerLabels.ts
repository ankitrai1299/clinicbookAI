// Speaker labelling ("who said what") for a consultation transcript.
//
// Our STT returns plain text with no speaker turns, so transcripts read as one
// undifferentiated block and every line is stored as 'Unknown Speaker'. True
// acoustic diarization needs provider support we don't have, so we do the next
// best thing: ask the model to split the transcript into turns and label each as
// Doctor or Patient using clinical context (who asks vs who describes symptoms).
//
// Read-only and additive: it never edits the transcript text, only segments it.
// If anything goes wrong the caller keeps the original unlabelled transcript.

import { sarvamChat } from './sarvam.js';

export interface SpeakerTurn {
  speaker: 'Doctor' | 'Patient';
  text: string;
}

const SYSTEM =
  'You segment a medical consultation transcript into speaker turns.\n' +
  'The transcript has NO speaker labels. Split it into consecutive turns and label each as "Doctor" or "Patient".\n' +
  'Rules:\n' +
  '- Preserve the original wording EXACTLY. Never translate, summarise, correct or add words.\n' +
  '- Every word of the input must appear in the output, in the same order.\n' +
  '- The clinician asks questions, examines, explains and advises; the patient describes symptoms and answers.\n' +
  '- If a stretch is genuinely ambiguous, attribute it to the more likely speaker rather than inventing a third.\n' +
  'Reply with ONLY a JSON object of the form {"turns":[{"speaker":"Doctor","text":"..."}]}';

// Tolerate a model that wraps JSON in prose or code fences.
function extractJson(raw: string): unknown {
  const text = (raw || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Split a transcript into labelled Doctor/Patient turns. Returns an empty array
 * when the transcript is too short to segment or the model output is unusable —
 * callers should then simply keep showing the plain transcript.
 */
export async function labelSpeakers(transcript: string): Promise<SpeakerTurn[]> {
  const text = (transcript || '').trim();
  if (text.length < 40) return [];

  const raw = await sarvamChat(
    [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: text.slice(0, 12000) },
    ],
    { maxTokens: 4000 },
  );

  const parsed = extractJson(raw) as { turns?: Array<{ speaker?: string; text?: string }> } | null;
  const turns = Array.isArray(parsed?.turns) ? parsed!.turns! : [];

  const cleaned: SpeakerTurn[] = turns
    .map((t) => ({
      speaker: (String(t?.speaker || '').toLowerCase().startsWith('doc') ? 'Doctor' : 'Patient') as SpeakerTurn['speaker'],
      text: String(t?.text ?? '').trim(),
    }))
    .filter((t) => t.text.length > 0);

  if (cleaned.length === 0) return [];

  // Guard against a model that paraphrased or dropped content: the labelled turns
  // must account for most of the original transcript. If not, discard the result
  // rather than show the doctor a transcript that isn't what was said.
  const strip = (s: string) => s.toLowerCase().replace(/[^a-z0-9ऀ-ॿ]+/g, '');
  const joined = strip(cleaned.map((t) => t.text).join(''));
  const original = strip(text);
  if (original.length > 0 && joined.length < original.length * 0.8) return [];

  return cleaned;
}
