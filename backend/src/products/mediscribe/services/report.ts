// Clinical report generation via Sarvam AI (chat).
//
// Produces the SAME structured ReportData JSON (identical schema → identical
// report format/sections in the UI). Extracts ONLY what is present in the
// transcript — it never invents medicines, diagnoses, tests, dosages or advice —
// and ALWAYS outputs English regardless of the transcript language.
//
// Sarvam's chat model is a reasoning model with a hard per-request token cap
// (4096) shared between the reasoning trace and the answer. A rich consultation's
// full report JSON plus that reasoning easily exceeds the cap, which returned
// empty content ("token budget exhausted"). This module avoids that by:
//   1. Pre-translating a non-English transcript to English first.
//   2. Condensing a very long transcript into concise English facts (chunked).
//   3. Generating the report in SMALL SECTION GROUPS (not one giant JSON), each
//      well within the token budget, then merging them.
//   4. NOT using response_format:json_object — that option massively inflates the
//      reasoning trace; a "/no_think" hint plus prompt-level JSON works far better.
//   5. Retrying a group once if it comes back empty, and degrading a stubborn
//      group to empty rather than failing the whole report.
//
// The API key is read from the environment (SARVAM_API_KEY) and NEVER logged.

import type { ReportData } from '../shared/types.js';
import { normalizeReport } from '../shared/report.js';
import { sarvamChat, sarvamKey } from './sarvam.js';
import { translateTranscript } from './translate.js';

// Detect a non-Latin Indian/Urdu script — Devanagari (0900–097F) … Malayalam
// (0D00–0D7F), plus Perso-Arabic (0600–06FF, 0750–077F). Used to decide whether
// to pre-translate the transcript to English before report extraction.
const NON_LATIN_RE = /[ऀ-ൿ؀-ۿݐ-ݿ]/;

// Shared extraction rules prepended to every section-group prompt. Deliberately
// concise (a long prompt only feeds the reasoning trace and risks the budget).
const SHARED_RULES =
  'You are a clinical documentation assistant extracting a structured clinical report from a consultation transcript.\n' +
  'RULES:\n' +
  '- Output MUST be entirely in English. Translate any non-English content (Hindi/Urdu/Telugu/etc.) into English; never emit non-Latin script. Medicine names and proper nouns may keep their standard Latin spelling.\n' +
  '- Extract ONLY facts present in the transcript; never invent medicines, diagnoses, tests, dosages or vitals. Preserve medicine names, doses, frequencies, durations and values exactly as stated.\n' +
  '- Capture every relevant fact for the requested fields. Leave anything not mentioned empty ([] or "").\n' +
  '- Return ONLY a single JSON object with EXACTLY the requested keys — no markdown fences, no commentary.';

// The report schema is generated in these four groups. Splitting the output keeps
// each response small enough to fit the token budget even for a dense consultation
// (reviewOfSystems is isolated because grouping symptoms by body system is the most
// reasoning-heavy part). Merged back into the full ReportData shape afterwards.
const SECTION_GROUPS: { label: string; schema: string; guidance: string }[] = [
  {
    label: 'history',
    schema:
      '{"clinicalOverview":"","chiefComplaints":[{"complaint":"","duration":"","severity":""}],"historyOfPresentIllness":[""],"pastMedicalHistory":[""],"surgicalHistory":[""],"medicationHistory":[{"medicine":"","strength":"","dose":"","route":"","frequency":"","timing":"","purpose":"","compliance":""}],"allergies":[{"allergy":"","reaction":"","severity":""}],"familyHistory":[""],"socialHistory":[""]}',
    guidance:
      'clinicalOverview: 2-4 sentence physician summary. chiefComplaints: main reasons for visit with duration/severity. historyOfPresentIllness: onset, progression, associated and denied symptoms, prior treatment (one fact each). pastMedicalHistory: chronic/past diseases. surgicalHistory: past surgeries. medicationHistory: medicines already taken before this visit. allergies; familyHistory; socialHistory (smoking/alcohol/diet/occupation) — only as stated.',
  },
  {
    label: 'systems',
    schema: '{"reviewOfSystems":[{"name":"","findings":[""]}]}',
    guidance:
      'reviewOfSystems: group associated and explicitly negative/denied symptoms by body system (General, Cardiovascular, Respiratory, Gastrointestinal, Neurological, Endocrine, Musculoskeletal, ENT, Skin). Only include systems that actually have findings.',
  },
  {
    label: 'exam',
    schema:
      '{"clinicalMeasurements":{"bloodPressure":"","pulse":"","temperature":"","spo2":"","bloodSugar":"","height":"","weight":"","bmi":"","painScore":"","other":""},"physicalExamination":[{"name":"","findings":[""]}]}',
    guidance:
      'clinicalMeasurements: vitals EXACTLY as stated; any other measurement goes in "other"; leave unmeasured vitals "". physicalExamination: examination findings grouped by area (General, Cardiovascular, Respiratory, Abdomen, Neurological, Skin, ENT). Only areas actually examined.',
  },
  {
    label: 'plan',
    schema:
      '{"assessment":[""],"prescribedMedications":[{"medicine":"","strength":"","dose":"","route":"","frequency":"","timing":"","duration":"","instructions":""}],"ordersDiagnostics":[{"name":"","findings":[""]}],"advice":[""],"redFlags":[""],"followUp":{"date":"","duration":"","reports":"","instructions":""}}',
    guidance:
      'assessment: diagnoses, suspected conditions and clinical concerns from the transcript only. prescribedMedications: ONLY medicines prescribed/changed in THIS visit. ordersDiagnostics: tests ordered, grouped by category name ("Laboratory Orders", "Imaging Orders", "Cardiac Evaluation" or "Other Diagnostic Tests"). advice: care plan and lifestyle instructions. redFlags: warning signs to watch for. followUp: date, duration, required reports and next-visit instructions.',
  },
];

// Above this length the transcript is condensed into English facts first, so each
// section-group call reasons over a smaller input.
const CONDENSE_THRESHOLD = 3500;
const CONDENSE_CHUNK = 1800;

// Parse the model's JSON answer. Tolerates a stray ```json fence or surrounding
// prose by extracting the outermost { … } block before parsing.
function parseJson(raw: string | null | undefined): any {
  if (!raw) return {};
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    return {};
  }
}

// Split text into chunks of ≤ maxLen on sentence boundaries.
function chunkText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const parts = text.split(/(?<=[.!?।\n])\s+/);
  const chunks: string[] = [];
  let current = '';
  for (const part of parts) {
    if (current && current.length + part.length + 1 > maxLen) {
      chunks.push(current);
      current = '';
    }
    current = current ? `${current} ${part}` : part;
  }
  if (current) chunks.push(current);
  return chunks;
}

// Condense a long transcript into concise English clinical facts, chunk by chunk,
// so the downstream section-group calls reason over a smaller input. Best-effort:
// a chunk that fails to condense is kept verbatim.
async function condenseIfLong(text: string): Promise<string> {
  if (text.length <= CONDENSE_THRESHOLD) return text;
  const chunks = chunkText(text, CONDENSE_CHUNK);
  console.log('[generate-report] long transcript — condensing to facts in', chunks.length, 'chunks');
  const factParts: string[] = [];
  for (const chunk of chunks) {
    try {
      const facts = await sarvamChat(
        [
          {
            role: 'system',
            content:
              'Summarise the consultation transcript into concise English clinical bullet points, preserving ALL symptoms, durations, past/family/social history, medicines with doses and frequencies, allergies, vitals, examination findings, diagnoses, tests ordered, advice and follow-up. English only. Plain text bullets, no JSON.',
          },
          { role: 'user', content: `/no_think\nTranscript:\n${chunk}` },
        ],
        { maxTokens: 4096, reasoningEffort: 'low' },
      );
      factParts.push(facts.trim());
    } catch (err: any) {
      console.error('[generate-report] facts condensation failed for a chunk; keeping raw text:', err?.message || err);
      factParts.push(chunk);
    }
  }
  return factParts.join('\n');
}

// Extract one section group as a JSON object. Retries once if Sarvam returns empty
// content (token budget), and degrades to an empty object rather than failing the
// whole report if it still cannot produce that group. A genuine API error (bad
// key, network) is surfaced instead of being masked.
async function extractGroup(text: string, group: (typeof SECTION_GROUPS)[number]): Promise<Record<string, unknown>> {
  const { glossaryForPrompt } = await import('./medicalTerms.js');
  const system =
    `${SHARED_RULES}\n\n` +
    `KNOWN MEDICAL TERMS — when the transcript approximates a drug, diagnosis or ` +
    `investigation by pronunciation, use the CORRECT spelling from this list ` +
    `(do NOT introduce a term the transcript does not imply):\n${glossaryForPrompt()}\n\n` +
    `Extract ONLY these fields as a JSON object:\n${group.schema}\n\nGuidance: ${group.guidance}`;
  const user = `/no_think\nConsultation transcript:\n${text}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const content = await sarvamChat(
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        { maxTokens: 4096, reasoningEffort: 'low' },
      );
      const obj = parseJson(content);
      if (obj && typeof obj === 'object' && !Array.isArray(obj) && Object.keys(obj).length) {
        return obj as Record<string, unknown>;
      }
      console.error(`[generate-report] group "${group.label}" returned empty/unparseable JSON (attempt ${attempt})`);
    } catch (err: any) {
      if (!err?.emptyContent) throw err; // real API/transport error → surface it
      console.error(`[generate-report] group "${group.label}" token budget exhausted (attempt ${attempt}) — retrying`);
    }
  }
  console.error(`[generate-report] group "${group.label}" could not be generated — leaving it empty`);
  return {};
}

/**
 * Generate a structured clinical report from a consultation transcript using
 * Sarvam's chat model. Always outputs English; extracts only what is present in
 * the transcript. The result is merged onto a full empty report so every
 * field/section always exists (identical shape to before).
 */
export async function generateMedicalReport(transcript: string): Promise<ReportData> {
  if (!sarvamKey()) {
    throw new Error('SARVAM_API_KEY is not configured');
  }

  // 1) Force English: translate a non-English transcript to English FIRST so the
  //    report is reliably English. This English copy is INTERNAL to report
  //    generation only — the transcript shown in the UI is never modified.
  let text = transcript;
  if (NON_LATIN_RE.test(transcript)) {
    try {
      const english = (await translateTranscript(transcript, 'en')).trim();
      if (english) {
        text = english;
        console.log('[generate-report] non-English transcript pre-translated to English for extraction');
      }
    } catch (err) {
      console.error('[generate-report] pre-translation to English failed; using original transcript:', err);
    }
  }

  // 2) Condense a very long transcript into English facts so each section-group
  //    call reasons over a smaller input, then fix medical terms STT mis-heard
  //    (e.g. "azithromicin" → "Azithromycin") using the editable glossary.
  const { correctMedicalTerms } = await import('./medicalTerms.js');
  const source = correctMedicalTerms(await condenseIfLong(text));

  // 3) Generate the report in small section groups and merge them. Sectioning keeps
  //    every response within the token budget even for a dense consultation.
  console.log('[generate-report] extracting', SECTION_GROUPS.length, 'section groups | source chars:', source.length);
  const merged: Record<string, unknown> = {};
  for (const group of SECTION_GROUPS) {
    Object.assign(merged, await extractGroup(source, group));
  }

  // 4) Merge onto a full empty report so every field/section always exists.
  return normalizeReport(merged);
}
