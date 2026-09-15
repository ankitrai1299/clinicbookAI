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

import { sarvamChat } from '../../../core/ai/sarvam.js';

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

// ── Acoustic turns, with roles put on them ────────────────────────────────
//
// Sarvam's batch API separates the VOICES and calls them "0" and "1". It has no
// idea which one is the doctor, and nothing acoustic ever will — that is a fact
// about the conversation, not about the sound.
//
// So the work splits in two, and each half goes to whatever is good at it:
// acoustics decide WHERE the turns are, and the model decides WHOSE they are.
// That is a far easier question than the one above — "which of these two people
// is the clinician" rather than "invent the turn boundaries from punctuation" —
// and it is asked about two voices rather than about every sentence.

import type { DiarizedTurn } from '../../../core/ai/stt.js';

const ROLE_SYSTEM =
  'You are told the turns of a medical consultation, already separated by voice.\n' +
  'Decide which voice is the clinician and which is the patient.\n' +
  'The clinician asks questions, examines, explains and prescribes; the patient describes symptoms and answers.\n' +
  'Reply with ONLY a JSON object mapping each speaker id to a role, e.g. {"0":"Doctor","1":"Patient"}';

/**
 * Who asks the questions?
 *
 * The fallback when the model is unavailable or answers nonsense, and it is not
 * a bad one: across a consultation the clinician asks most of them. Deliberately
 * NOT the first speaker — a patient who walks in already talking is ordinary,
 * and "whoever spoke first is the doctor" would be wrong in exactly those
 * consultations.
 */
const guessRolesByQuestions = (turns: DiarizedTurn[]): Record<string, 'Doctor' | 'Patient'> => {
  const asks = new Map<string, number>();
  for (const t of turns) {
    const q = (t.text.match(/[?？]/g) || []).length;
    asks.set(t.speakerId, (asks.get(t.speakerId) ?? 0) + q);
  }
  const ranked = [...asks.entries()].sort((a, b) => b[1] - a[1]);
  const out: Record<string, 'Doctor' | 'Patient'> = {};
  ranked.forEach(([id], i) => {
    out[id] = i === 0 ? 'Doctor' : 'Patient';
  });
  return out;
};

/**
 * Label acoustically separated turns as Doctor and Patient.
 *
 * Never invents or edits text: the words are the provider's, and this only
 * decides whose name goes in front of them.
 */
export async function labelDiarizedTurns(turns: DiarizedTurn[]): Promise<SpeakerTurn[]> {
  if (!turns.length) return [];

  const voices = [...new Set(turns.map((t) => t.speakerId))];
  let roles: Record<string, 'Doctor' | 'Patient'> = {};

  try {
    // A sample rather than the whole transcript: deciding which voice is the
    // clinician takes a handful of turns, and sending twenty minutes of
    // consultation to answer a two-way question is a cost with no return.
    const sample = turns
      .slice(0, 24)
      .map((t) => `[${t.speakerId}] ${t.text}`)
      .join('\n')
      .slice(0, 6000);

    const raw = await sarvamChat(
      [
        { role: 'system', content: ROLE_SYSTEM },
        { role: 'user', content: sample }
      ],
      { jsonMode: true, disableThinking: true, maxTokens: 300 }
    );
    const parsed = extractJson(raw) as Record<string, string> | null;
    if (parsed) {
      for (const id of voices) {
        const v = String(parsed[id] ?? '').toLowerCase();
        if (v.startsWith('doc') || v.startsWith('clin')) roles[id] = 'Doctor';
        else if (v.startsWith('pat')) roles[id] = 'Patient';
      }
    }
  } catch (err) {
    console.warn('[speakerLabels] role assignment failed, falling back:', (err as Error).message);
  }

  // Every voice must have a role, and there must be a doctor. A partial answer
  // is worse than no answer: half the consultation labelled and half blank
  // reads as a bug in the transcript rather than a limit of the model.
  const complete = voices.every((id) => roles[id]) && Object.values(roles).includes('Doctor');
  if (!complete) roles = guessRolesByQuestions(turns);

  return turns.map((t) => ({ speaker: roles[t.speakerId] ?? 'Patient', text: t.text }));
}
