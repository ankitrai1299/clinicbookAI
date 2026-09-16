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
import { sarvamChat, sarvamKey } from '../../../core/ai/sarvam.js';
import { isDeniedIn } from './negation.js';
import { translateTranscript } from './translate.js';
import { mapPool } from '../../../utils/pool.js';
import { normaliseSpokenNumbers } from './spokenNumbers.js';

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
  // The rule this section exists for. Measured: given "Patient ko Penicillin se
  // allergy NAHI hai", the report came back with Penicillin listed as an
  // allergy — the exact opposite of what was said, and a record that would deny
  // that patient the right antibiotic for years. Both models did it.
  '- NEGATION IS A CLINICAL FACT AND MUST SURVIVE. "no allergy", "allergy nahi hai", "denies chest pain", ' +
  '"koi dikkat nahi", "sugar nahi hai" mean the finding is ABSENT. Never record a denied finding as present. ' +
  'An allergy the patient denies is NOT an allergy; a symptom the patient denies is NOT a symptom; a condition ' +
  'ruled out is NOT a diagnosis.\n' +
  '- A denial belongs only where the schema has somewhere for it (explicitly negative findings in ' +
  'reviewOfSystems, or history noting a denial). Everywhere else leave the field EMPTY rather than listing ' +
  'the thing that was denied.\n' +
  '- If you cannot tell whether something was affirmed or denied, leave it out. An omission is a gap a doctor ' +
  'can see and fill; an inverted fact is one they cannot.\n' +
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
  // 'plan' was one group and carried six fields — the largest answer of the four,
  // and the one that failed. On an eight minute consultation it returned the four
  // order categories with every findings list empty, while naming the very same
  // tests under followUp.reports: the tests had survived the summarising, the
  // model just ran out of room to write them twice. Split so each call has less
  // to hold at once. They run in parallel, so five groups cost no more time than
  // four.
  {
    label: 'treatment',
    schema:
      '{"assessment":[""],"prescribedMedications":[{"medicine":"","strength":"","dose":"","route":"","frequency":"","timing":"","duration":"","instructions":""}]}',
    guidance:
      'assessment: diagnoses, suspected conditions and clinical concerns from the transcript only. prescribedMedications: ONLY medicines prescribed/changed in THIS visit.',
  },
  {
    label: 'orders',
    schema:
      '{"ordersDiagnostics":[{"name":"","findings":[""]}],"advice":[""],"redFlags":[""],"followUp":{"date":"","duration":"","reports":"","instructions":""}}',
    guidance:
      'ordersDiagnostics: EVERY test, scan or investigation the doctor asked for, grouped by category name ("Laboratory Orders", "Imaging Orders", "Cardiac Evaluation" or "Other Diagnostic Tests"). If a test is named anywhere in the text it belongs here, including one repeated in a closing summary; a category with nothing in it may be left out entirely, but a test that was ordered must never be. List each test ONCE under its fullest name — a doctor who reads the list back at the end of the visit has not ordered it twice. advice: care plan and lifestyle instructions. redFlags: warning signs to watch for. followUp: date, duration, required reports and next-visit instructions.',
  },
];

// Above this length the transcript is condensed into English facts first, so each
// section-group call reasons over a smaller input.
const CONDENSE_THRESHOLD = 3500;
const CONDENSE_CONCURRENCY = 4;
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
async function condense(text: string): Promise<string> {
  const chunks = chunkText(text, CONDENSE_CHUNK);
  console.log('[generate-report] long transcript — condensing to facts in', chunks.length, 'chunks');
  const factParts = await mapPool(chunks, CONDENSE_CONCURRENCY, async (chunk) => {
    try {
      const facts = await sarvamChat(
        [
          {
            role: 'system',
            content:
              'The transcript may be in Hindi, English, Hinglish or any other Indian language, in any script. ' +
              'Summarise it into concise English clinical bullet points, preserving ALL symptoms, durations, past/family/social history, medicines with doses and frequencies, allergies, vitals, examination findings, diagnoses, tests ordered, advice and follow-up. ' +
              'Keep every negative statement negative — "no chest pain", "denies penicillin allergy". A denial is a clinical fact, and losing the word that makes it one turns it into its opposite. ' +
              'English only. Plain text bullets, no JSON.',
          },
          { role: 'user', content: `/no_think\nTranscript:\n${chunk}` },
        ],
        // Thinking OFF, and this is the fix for reports coming back empty.
        //
        // Sarvam's models always reason, and the reasoning trace spends the SAME
        // token budget as the answer. Measured on one consultation: 3463 tokens
        // to produce 820 characters, then 2409 for 289, then a group that burned
        // all 4096 and returned 239 characters of unparseable fragment. The
        // report failed there.
        //
        // The "/no_think" in the prompt above was an earlier attempt at this and
        // does nothing — the request log said "thinking: on" every time. The
        // switch is a request parameter, not an instruction to the model.
        //
        // Nothing is lost: these calls extract structured fields that are
        // already stated in the transcript. There is no problem here for a model
        // to reason its way through, and it must not invent one.
        { maxTokens: 8192, reasoningEffort: 'low', disableThinking: true },
      );
      return facts.trim();
    } catch (err: any) {
      console.error('[generate-report] facts condensation failed for a chunk; keeping raw text:', err?.message || err);
      return chunk;
    }
  });
  return factParts.join('\n');
}

// Extract one section group as a JSON object. Retries once if Sarvam returns empty
// content (token budget), and degrades to an empty object rather than failing the
// whole report if it still cannot produce that group. A genuine API error (bad
// key, network) is surfaced instead of being masked.
/**
 * Remove a test listed twice under exactly the same name.
 *
 * A doctor who reads the order list back at the end of the visit says every
 * test twice, and the report then carried both mentions — "Urine routine",
 * "HbA1c" and the rest appearing once from the middle of the consultation and
 * once from the closing summary.
 *
 * Only EXACT repeats go, compared without case, punctuation or spacing.
 * Deliberately not clever: "Widal" and "Widal test" are left as two lines even
 * though they are plainly the same investigation, because the rule that would
 * collapse them also collapses "Blood sugar" into "Fasting blood sugar", and
 * they are two different tests. A slightly untidy list costs a doctor a glance.
 * A test quietly removed from it does not get done.
 */
function dedupeOrders(report: Record<string, unknown>): void {
  const categories = report.ordersDiagnostics;
  if (!Array.isArray(categories)) return;
  const key = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const seen = new Set<string>();
  for (const category of categories) {
    const findings = (category as any)?.findings;
    if (!Array.isArray(findings)) continue;
    (category as any).findings = findings.filter((f: unknown) => {
      const k = key(String(f ?? ''));
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
}

/**
 * Strip findings the transcript denied.
 *
 * Deliberately narrow: only the lists where a false POSITIVE changes treatment.
 * An allergy the patient does not have will deny them a drug for years; a
 * diagnosis that was ruled out will be treated as history by the next doctor
 * who reads the file.
 *
 * A finding the transcript does not mention at all is KEPT. The model may have
 * read a paraphrase this cannot match, and silently deleting clinical content
 * because a string comparison missed it would be its own kind of harm.
 */
export function dropDeniedFindings(report: Record<string, unknown>, texts: string[]): void {
  /**
   * The doctor's own words decide. The English only breaks a tie.
   *
   * `texts` is in priority order, original transcript first, and the first one
   * with an opinion wins outright — it does NOT take the safest answer across
   * both. That was the first attempt and it put the false allergy straight back:
   *
   *   transcript (Hindi)  "Penicillin से एलर्जी नहीं है"   → denied
   *   English translation  a reported question naming the drug → affirmed
   *   verdict: affirmed-anywhere-wins                          → KEPT Penicillin
   *
   * Affirmation-wins is the right rule INSIDE one text, where a doctor
   * correcting themselves mid-sentence means the allergy is real. Across two
   * versions of the same consultation it is not a correction at all — one of
   * them is a machine translation of the other, and letting it overrule the
   * words actually spoken puts a drug on the chart the patient was never said
   * to react to. The English is consulted only where the original is silent,
   * which is exactly where it can help: it names findings the original
   * phrased in a way this cannot match.
   */
  const verdict = (name: string): boolean | null => {
    for (const text of texts) {
      const call = isDeniedIn(text, name);
      if (call !== null) return call;
    }
    return null;
  };

  const prune = (key: string, nameOf: (row: any) => string): void => {
    const rows = report[key];
    if (!Array.isArray(rows) || !rows.length) return;
    const kept = rows.filter((row) => {
      const name = nameOf(row);
      if (!name) return true;
      const denied = verdict(name);
      if (denied === true) {
        console.warn(`[generate-report] dropped "${name}" from ${key} — the transcript denies it`);
        return false;
      }
      return true;
    });
    if (kept.length !== rows.length) report[key] = kept;
  };

  dedupeOrders(report);
  prune('allergies', (r) => String(r?.allergy ?? r?.name ?? '').trim());
  prune('diagnoses', (r) => String(r?.diagnosis ?? r?.name ?? r ?? '').trim());
}

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
        // Thinking OFF, and this is the fix for reports coming back empty.
        //
        // Sarvam's models always reason, and the reasoning trace spends the SAME
        // token budget as the answer. Measured on one consultation: 3463 tokens
        // to produce 820 characters, then 2409 for 289, then a group that burned
        // all 4096 and returned 239 characters of unparseable fragment. The
        // report failed there.
        //
        // The "/no_think" in the prompt above was an earlier attempt at this and
        // does nothing — the request log said "thinking: on" every time. The
        // switch is a request parameter, not an instruction to the model.
        //
        // Nothing is lost: these calls extract structured fields that are
        // already stated in the transcript. There is no problem here for a model
        // to reason its way through, and it must not invent one.
        { maxTokens: 8192, reasoningEffort: 'low', disableThinking: true },
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
  //
  //    Skipped when the transcript is long enough to be condensed below, because
  //    the condensing pass ALSO renders English — doing both translated the same
  //    consultation twice, which on a five minute Hindi consultation was four
  //    model calls spent to reach text the next step was going to produce
  //    anyway. It is not only slower, it is one more lossy pass over a clinical
  //    record than the report needs.
  //
  //    Both decisions are made from the length of the ORIGINAL transcript, and
  //    that matters: judging the second one by the length of the translation
  //    would let both passes run on the same consultation, which is the double
  //    work this is meant to avoid. Hindi expands when it becomes English, so a
  //    transcript just under the line would cross it once translated.
  const long = transcript.length > CONDENSE_THRESHOLD;

  let text = transcript;
  if (NON_LATIN_RE.test(transcript) && !long) {
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

  // 2) Condense a long transcript into English facts so each section-group call
  //    reasons over a smaller input — and, for a non-English one, this is the
  //    pass that produced the English. Then fix medical terms STT mis-heard
  //    (e.g. "azithromicin" → "Azithromycin") using the editable glossary.
  const { correctMedicalTerms } = await import('./medicalTerms.js');
  //
  //    Numbers last. A measurement that reached here as words has to leave as a
  //    number, because nothing downstream can read "one hundred point four
  //    degrees" as a temperature. It was only being done on the live transcript,
  //    so the two paths disagreed on the same consultation:
  //
  //      short (translated)  "150 over 96"   "Ninety-six per minute"
  //      long  (condensed)   "150/96 mmHg"   "96 beats per minute"
  //
  //    Safe to run on text that is already correct — digits stay digits, and it
  //    converts only measurements, never a duration or a count.
  const source = normaliseSpokenNumbers(correctMedicalTerms(long ? await condense(text) : text));

  // 3) Generate the report in small section groups and merge them. Sectioning keeps
  //    every response within the token budget even for a dense consultation.
  //    They run AT THE SAME TIME, and that is the difference between a report a
  //    doctor waits for and one they never see. Sequentially the four calls took
  //    about four minutes on a short consultation — past the client's three
  //    minute timeout, so the request died and the doctor got nothing after
  //    watching a spinner. The groups are independent: each pulls different
  //    fields out of the same text, so the wait is now the slowest one rather
  //    than the sum of all four.
  console.log('[generate-report] extracting', SECTION_GROUPS.length, 'section groups in parallel | source chars:', source.length);
  const started = Date.now();
  const results = await Promise.all(SECTION_GROUPS.map((group) => extractGroup(source, group)));
  console.log(`[generate-report] all groups finished in ${((Date.now() - started) / 1000).toFixed(0)}s`);

  // Merged in the declared order, not in the order they happened to return, so
  // the same consultation always produces the same report.
  const merged: Record<string, unknown> = {};
  for (const part of results) Object.assign(merged, part);

  //    Then the guard: remove anything the transcript actually DENIED.
  //
  //    Both models, given "Patient ko Penicillin se allergy NAHI hai", produced
  //    a report listing Penicillin as an allergy — and kept doing it after the
  //    prompt was given an explicit rule about negation in capitals with
  //    examples. So it is checked in code instead. See ./negation.ts.
  dropDeniedFindings(merged, [transcript, source]);

  // 4) Merge onto a full empty report so every field/section always exists.
  return normalizeReport(merged);
}
