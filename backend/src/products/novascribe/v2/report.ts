// Structured Premium Clinical Report generation (2-pass: extraction → completeness
// validation). Ported verbatim from the reference NovaScribe app; uses the shared
// OpenAI key.

import OpenAI from 'openai';

import { env } from '../../../config/env.js';
import { normalizeReport } from './normalizeReport.js';

const apiKey = (env.OPENAI_API_KEY || '').trim();
const openai = new OpenAI({ apiKey });

const SCHEMA = `{
  "clinicalOverview": "string — an AI physician summary paragraph",
  "chiefComplaints": [ { "complaint": "", "duration": "", "severity": "" } ],
  "historyOfPresentIllness": ["string"],
  "pastMedicalHistory": ["string"],
  "surgicalHistory": ["string"],
  "medicationHistory": [ { "medicine": "", "strength": "", "dose": "", "route": "", "frequency": "", "timing": "", "purpose": "", "compliance": "" } ],
  "allergies": [ { "allergy": "", "reaction": "", "severity": "" } ],
  "familyHistory": ["string"],
  "socialHistory": ["string"],
  "reviewOfSystems": [ { "name": "", "findings": ["string"] } ],
  "clinicalMeasurements": { "bloodPressure": "", "pulse": "", "temperature": "", "spo2": "", "bloodSugar": "", "height": "", "weight": "", "bmi": "", "painScore": "", "other": "" },
  "physicalExamination": [ { "name": "", "findings": ["string"] } ],
  "assessment": ["string"],
  "prescribedMedications": [ { "medicine": "", "strength": "", "dose": "", "route": "", "frequency": "", "timing": "", "duration": "", "instructions": "" } ],
  "ordersDiagnostics": [ { "name": "", "findings": ["string"] } ],
  "advice": ["string"],
  "redFlags": ["string"],
  "followUp": { "date": "", "duration": "", "reports": "", "instructions": "" }
}`;

const MAPPING_RULES =
  'SECTION MAPPING — map every fact that exists in the transcript, and leave everything else empty:\n' +
  '- clinicalOverview: a concise physician-style summary paragraph synthesising demographics (only if stated), the reason for visit, major complaints with duration, important history, chronic diseases, risk factors and current clinical status. Write 2–5 sentences. Do NOT invent demographics or facts.\n' +
  '- chiefComplaints: one row per main complaint / reason for visit, with its duration and severity when stated.\n' +
  '- historyOfPresentIllness: onset, duration, progression, frequency, severity, location, radiation, character, triggers, relieving factors, associated symptoms, negative/denied symptoms, prior treatment, treatment response and functional impact — one fact per item.\n' +
  '- pastMedicalHistory: known chronic/past diseases with duration and status, prior illnesses and hospital admissions.\n' +
  '- surgicalHistory: previous surgeries/procedures with date, hospital and complications when stated. Empty if none.\n' +
  '- medicationHistory: medicines the patient is ALREADY taking before this visit. Fill medicine, strength, dose, route, frequency, timing, purpose, compliance when stated; leave unknown fields "".\n' +
  '- allergies: each allergy with its reaction and severity. Empty if none mentioned.\n' +
  '- familyHistory: family/hereditary history — one item each.\n' +
  '- socialHistory: smoking, alcohol, tobacco, diet, exercise, sleep, occupation, stress — only those mentioned.\n' +
  '- reviewOfSystems: group associated and explicitly negative symptoms by body system. Only include systems that have findings.\n' +
  '- clinicalMeasurements: vitals EXACTLY as stated; put any other measurement in "other". Leave unmeasured vitals "".\n' +
  '- physicalExamination: examination findings grouped by area. Only the examined areas. Empty if no examination documented.\n' +
  '- assessment: confirmed diagnoses, suspected conditions, risk factors and clinical concerns. Use transcript evidence only — NEVER invent a diagnosis.\n' +
  '- prescribedMedications: ONLY medicines prescribed/changed in THIS visit. Fill fields when stated; leave unknown fields "".\n' +
  '- ordersDiagnostics: tests/investigations ordered, grouped by category ("Laboratory Orders", "Imaging Orders", "Cardiac Evaluation", "Other Diagnostic Tests"). Only categories with data.\n' +
  '- advice: care plan & patient instructions — one item each.\n' +
  '- redFlags: warning signs / emergency symptoms to watch for. Only if clinically relevant. Empty otherwise.\n' +
  '- followUp: follow-up date, duration, any required reports and next-visit instructions when stated.';

const EXTRACTION_SYSTEM_PROMPT =
  'You are a clinical documentation assistant. Read the consultation transcript and produce a ' +
  'structured clinical report as JSON.\n\n' +
  'COMPLETENESS (most important):\n' +
  '- Capture EVERY clinically relevant fact present in the transcript. Nothing may be silently dropped.\n' +
  '- Prefer completeness over summarization. Do NOT shorten by omitting clinical details.\n\n' +
  'ACCURACY:\n' +
  '- Extract ONLY information actually present in the transcript. Do NOT invent or hallucinate ' +
  'medicines, diagnoses, tests, dosages, vitals or advice.\n' +
  '- Preserve medicine names, dosage, frequency, duration, test names and vital values EXACTLY as stated.\n\n' +
  'LANGUAGE:\n' +
  '- The transcript may be in any language. ALWAYS write the report in ENGLISH (translate clinical content faithfully).\n\n' +
  'FORMAT:\n' +
  '- Each list field holds short, clear items (one fact per item); object/table rows fill only the fields stated.\n' +
  '- If a field, row, list or section is genuinely not mentioned, leave it empty ([] / "" / no rows). NEVER output "N/A", "Not mentioned", "-" or placeholder text.\n' +
  '- Generate physician-quality documentation. Do NOT limit the number of complaints, diagnoses, medicines, tests, history items or findings.\n\n' +
  MAPPING_RULES +
  '\n\nReturn ONLY a JSON object with EXACTLY this shape (same keys, no extras):\n' +
  SCHEMA;

const VALIDATION_SYSTEM_PROMPT =
  'You are a clinical QA reviewer performing a completeness check on a draft clinical report.\n\n' +
  'You are given the original consultation transcript and a DRAFT report (JSON). Your job:\n' +
  '1. Compare the transcript against the draft, entity by entity.\n' +
  '2. Find EVERY clinically relevant fact present in the transcript that is missing from, or ' +
  'incompletely captured in, the draft.\n' +
  '3. Produce a CORRECTED report (same JSON schema) that KEEPS everything already correct and ADDS every missing fact.\n' +
  '4. Ensure clinicalOverview is a faithful physician summary.\n\n' +
  'RULES:\n' +
  '- Do NOT remove or weaken any correct information already in the draft.\n' +
  '- Do NOT invent anything that is not in the transcript.\n' +
  '- Preserve medicine names, dosages, frequencies, durations, test names and vital values EXACTLY.\n' +
  '- Output must be in ENGLISH.\n\n' +
  MAPPING_RULES +
  '\n\nReturn ONLY the corrected JSON object with EXACTLY this shape (same keys, no extras):\n' +
  SCHEMA;

const parseJson = (raw: string | null | undefined): unknown => {
  try {
    return JSON.parse(raw ?? '{}');
  } catch {
    return {};
  }
};

export const generateMedicalReport = async (transcript: string) => {
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const extraction = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
      { role: 'user', content: `Consultation transcript:\n${transcript}` }
    ]
  });

  const draft = parseJson(extraction.choices[0]?.message?.content);

  let finalReport: unknown = draft;
  try {
    const validation = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: VALIDATION_SYSTEM_PROMPT },
        { role: 'user', content: `Consultation transcript:\n${transcript}\n\nDraft report (JSON):\n${JSON.stringify(draft)}` }
      ]
    });
    const validated = parseJson(validation.choices[0]?.message?.content);
    if (validated && typeof validated === 'object' && !Array.isArray(validated)) {
      finalReport = validated;
    }
  } catch (err) {
    console.error('[nova.report] validation pass failed; using draft:', err);
  }

  return normalizeReport(finalReport);
};
