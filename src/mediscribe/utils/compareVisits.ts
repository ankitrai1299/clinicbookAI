// Compare Previous Visit — a pure, read-only helper that diffs the CURRENT
// consultation's report against the patient's immediately previous visit.
//
// This module creates/duplicates nothing and touches no API, database, report
// generation, transcription or session logic. It only reads two already-loaded
// ReportData objects (same patient) and returns a structured diff the UI renders.

import { ReportData, Vitals, FollowUp } from '../types';
import { VITALS_FIELDS } from './report';

export interface SymptomComparison {
  // Present last visit, gone now.
  resolved: string[];
  // New this visit.
  added: string[];
  // Present in both visits.
  continuing: string[];
}

export interface VitalChange {
  label: string;
  previous: string;
  current: string;
  // Numeric trend (first number in each value). null when non-numeric.
  direction: 'up' | 'down' | 'same' | null;
}

export interface MedicineChange {
  // Started this visit.
  started: string[];
  // On the previous plan, not on the current one.
  stopped: string[];
  // Continued across both visits (with a note when dose/frequency changed).
  continued: string[];
}

export interface TestComparison {
  added: string[];
  removed: string[];
  continuing: string[];
}

export interface VisitComparison {
  symptoms: SymptomComparison;
  vitals: VitalChange[];
  medicines: MedicineChange;
  tests: TestComparison;
  diagnoses: TestComparison;
  progress: { label: 'Improving' | 'Needs attention' | 'Mixed' | 'Stable'; summary: string } | null;
  // True when at least one section has something to show.
  hasAny: boolean;
}

const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const norm = (v: string): string => v.trim().toLowerCase();

// AI reports fill absent fields with "Not mentioned" / "None" placeholders — drop
// them so the summary shows only real clinical content.
const PLACEHOLDERS = new Set(['not mentioned', 'none', 'none mentioned', 'n/a', 'na', 'nil', 'not applicable', 'no', 'not specified', 'unknown']);
const isPlaceholder = (s: string): boolean => PLACEHOLDERS.has(norm(s));

// First number found in a free-text vital (e.g. "120/80 mmHg" → 120, "98.6 F" → 98.6).
function firstNumber(value: string): number | null {
  const m = value.match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

// Symptom names for a report: prefer structured complaint rows, else the flat
// chiefComplaint projection (taking the complaint text before any " — " suffix).
function symptomNames(report: ReportData): string[] {
  const rows = Array.isArray(report.chiefComplaints) ? report.chiefComplaints : [];
  const fromRows = rows.map(r => clean(r?.complaint)).filter(Boolean);
  if (fromRows.length) return fromRows;
  const flat = Array.isArray(report.chiefComplaint) ? report.chiefComplaint : [];
  return flat.map(s => clean(s).split('—')[0].trim()).filter(Boolean);
}

// Flattened, de-duplicated diagnostic test / order findings for a report.
function testFindings(report: ReportData): string[] {
  const groups = Array.isArray(report.ordersDiagnostics) ? report.ordersDiagnostics : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const g of groups) {
    for (const f of g?.findings || []) {
      const text = clean(f);
      if (text && !seen.has(norm(text))) {
        seen.add(norm(text));
        out.push(text);
      }
    }
  }
  return out;
}

// Diff two string lists case-insensitively, preserving the original casing of
// whichever side a value came from.
function diffLists(prev: string[], curr: string[]) {
  const prevMap = new Map(prev.map(s => [norm(s), s]));
  const currMap = new Map(curr.map(s => [norm(s), s]));
  const added: string[] = [];
  const removed: string[] = [];
  const both: string[] = [];
  for (const [k, v] of currMap) (prevMap.has(k) ? both : added).push(v);
  for (const [k, v] of prevMap) if (!currMap.has(k)) removed.push(v);
  return { added, removed, both };
}

// Whether a report carries any clinical content worth comparing against. Used to
// avoid a misleading all-"stopped"/all-"resolved" diff before the current report
// has been generated.
export function reportHasClinicalContent(report: ReportData): boolean {
  if (symptomNames(report).length) return true;
  if (Array.isArray(report.prescribedMedications) && report.prescribedMedications.some(m => clean(m?.medicine))) return true;
  if (testFindings(report).length) return true;
  const v = report.clinicalMeasurements || ({} as Vitals);
  if (VITALS_FIELDS.some(f => clean(v[f.key]))) return true;
  return false;
}

function compareSymptoms(prev: ReportData, curr: ReportData): SymptomComparison {
  const { added, removed, both } = diffLists(symptomNames(prev), symptomNames(curr));
  return { resolved: removed, added, continuing: both };
}

function compareVitals(prev: ReportData, curr: ReportData): VitalChange[] {
  const pv = prev.clinicalMeasurements || ({} as Vitals);
  const cv = curr.clinicalMeasurements || ({} as Vitals);
  const out: VitalChange[] = [];
  for (const f of VITALS_FIELDS) {
    const previous = clean(pv[f.key]);
    const current = clean(cv[f.key]);
    // Only compare fields recorded at BOTH visits — never an empty / one-sided row.
    if (!previous || !current) continue;
    const a = firstNumber(previous);
    const b = firstNumber(current);
    let direction: VitalChange['direction'] = null;
    if (a !== null && b !== null) direction = b > a ? 'up' : b < a ? 'down' : 'same';
    out.push({ label: f.label, previous, current, direction });
  }
  return out;
}

// Name → "dose • frequency" signature, to flag a continued medicine whose
// regimen changed.
function medName(m: any): string {
  return clean(m?.medicine);
}
function medRegimen(m: any): string {
  return [clean(m?.dose) || clean(m?.dosage), clean(m?.frequency), clean(m?.duration)]
    .filter(Boolean)
    .join(' • ');
}

function compareMedicines(prev: ReportData, curr: ReportData): MedicineChange {
  const prevRows = (Array.isArray(prev.prescribedMedications) ? prev.prescribedMedications : []).filter(m => medName(m));
  const currRows = (Array.isArray(curr.prescribedMedications) ? curr.prescribedMedications : []).filter(m => medName(m));
  const prevMap = new Map(prevRows.map(m => [norm(medName(m)), m]));
  const currMap = new Map(currRows.map(m => [norm(medName(m)), m]));

  const started: string[] = [];
  const stopped: string[] = [];
  const continued: string[] = [];

  for (const [k, m] of currMap) {
    if (!prevMap.has(k)) {
      started.push(medName(m));
    } else {
      const before = medRegimen(prevMap.get(k));
      const after = medRegimen(m);
      continued.push(
        before && after && before !== after
          ? `${medName(m)} (${before} → ${after})`
          : medName(m),
      );
    }
  }
  for (const [k, m] of prevMap) if (!currMap.has(k)) stopped.push(medName(m));

  return { started, stopped, continued };
}

function compareTests(prev: ReportData, curr: ReportData): TestComparison {
  const { added, removed, both } = diffLists(testFindings(prev), testFindings(curr));
  return { added, removed, continuing: both };
}

// Diagnosis (assessment) names for a report, minus placeholder fillers.
function diagnosisNames(report: ReportData): string[] {
  return (Array.isArray(report.assessment) ? report.assessment : [])
    .map(clean)
    .filter(s => s && !isPlaceholder(s));
}

function compareDiagnoses(prev: ReportData, curr: ReportData): TestComparison {
  const { added, removed, both } = diffLists(diagnosisNames(prev), diagnosisNames(curr));
  return { added, removed, continuing: both };
}

// A gentle, non-prescriptive overall-progress read derived from symptom
// resolution and pain-score trend. Never claims more than the data supports.
function buildProgress(
  symptoms: SymptomComparison,
  prev: ReportData,
  curr: ReportData,
  hasAny: boolean,
): VisitComparison['progress'] {
  if (!hasAny) return null;

  const painPrev = firstNumber(clean(prev.clinicalMeasurements?.painScore || ''));
  const painCurr = firstNumber(clean(curr.clinicalMeasurements?.painScore || ''));
  const painDown = painPrev !== null && painCurr !== null && painCurr < painPrev;
  const painUp = painPrev !== null && painCurr !== null && painCurr > painPrev;

  const improvements = symptoms.resolved.length + (painDown ? 1 : 0);
  const concerns = symptoms.added.length + (painUp ? 1 : 0);

  let label: NonNullable<VisitComparison['progress']>['label'];
  if (improvements > 0 && concerns === 0) label = 'Improving';
  else if (concerns > 0 && improvements === 0) label = 'Needs attention';
  else if (improvements > 0 && concerns > 0) label = 'Mixed';
  else label = 'Stable';

  const parts: string[] = [];
  if (symptoms.resolved.length) parts.push(`${symptoms.resolved.length} symptom(s) resolved`);
  if (symptoms.added.length) parts.push(`${symptoms.added.length} new symptom(s)`);
  if (symptoms.continuing.length) parts.push(`${symptoms.continuing.length} ongoing`);
  if (painDown) parts.push('pain score lower');
  if (painUp) parts.push('pain score higher');

  const summary = parts.length
    ? `Since the previous visit: ${parts.join(', ')}.`
    : 'Findings are largely unchanged since the previous visit.';

  return { label, summary };
}

// ── Previous Visit Summary + Previous Medications ────────────────────────────
// A concise, structured read of a completed visit's report — shown in a new
// consultation so the doctor sees the last visit at a glance and can carry
// medicines forward. Pure/read-only.

export interface PreviousMedicine {
  medicine: string;
  dose: string;
  frequency: string;
  reason: string;
}

export interface VisitSummary {
  diagnosis: string[];
  complaints: string[];
  medications: PreviousMedicine[];
  investigations: string[];
  followUp: string[];
  allergies: string[];
  chronic: string[];
}

/** The prescribed medicines of a report, flattened to medicine/dose/frequency/reason. */
export function previousMedicines(report: ReportData): PreviousMedicine[] {
  const rows = Array.isArray(report.prescribedMedications) ? report.prescribedMedications : [];
  return rows
    .filter(m => clean(m?.medicine))
    .map(m => ({
      medicine: clean(m.medicine),
      dose: clean((m as any).dose) || clean((m as any).dosage) || clean(m.strength),
      frequency: clean(m.frequency),
      reason: clean(m.purpose) || clean(m.instructions),
    }));
}

/** Structured summary of a previous completed visit (diagnosis, complaints, meds,
 *  investigations, follow-up, allergies, chronic conditions). */
export function buildVisitSummary(report: ReportData): VisitSummary {
  const diagnosis = (Array.isArray(report.assessment) ? report.assessment : [])
    .map(clean)
    .filter(s => s && !isPlaceholder(s));
  const complaints = symptomNames(report);
  const medications = previousMedicines(report);
  const investigations = testFindings(report);
  const allergies = (Array.isArray(report.allergies) ? report.allergies : [])
    .map(a => {
      const name = clean(a?.allergy);
      if (!name || isPlaceholder(name)) return '';
      const reaction = clean(a?.reaction);
      return reaction && !isPlaceholder(reaction) ? `${name} (${reaction})` : name;
    })
    .filter(Boolean);
  const chronic = (Array.isArray(report.pastMedicalHistory) ? report.pastMedicalHistory : [])
    .map(clean)
    .filter(s => s && !isPlaceholder(s));
  const fu = report.followUp || ({} as FollowUp);
  const followUp = [
    clean(fu.duration) && `Review after ${clean(fu.duration)}`,
    clean(fu.date) && `On ${clean(fu.date)}`,
    clean(fu.reports),
    clean(fu.instructions),
  ].filter(Boolean) as string[];
  return { diagnosis, complaints, medications, investigations, followUp, allergies, chronic };
}

// A CONCISE clinical comparison (max 8 bullets) — only meaningful differences, not
// a copy of the previous report. Used both on-screen and in the PDF.
export function buildComparisonBullets(prev: ReportData, curr: ReportData): string[] {
  const out: string[] = [];
  const dxPrev = diagnosisNames(prev);
  const dxCurr = diagnosisNames(curr);
  if (dxPrev.length) out.push(`Previous diagnosis: ${dxPrev.slice(0, 3).join(', ')}`);
  if (dxCurr.length) out.push(`Current diagnosis: ${dxCurr.slice(0, 3).join(', ')}`);

  const sym = compareSymptoms(prev, curr);
  if (sym.resolved.length) out.push(`Resolved: ${sym.resolved.slice(0, 3).join(', ')}`);
  if (sym.added.length) out.push(`New symptoms: ${sym.added.slice(0, 3).join(', ')}`);

  for (const v of compareVitals(prev, curr)) {
    if (out.length >= 8) break;
    if (v.direction && v.direction !== 'same') out.push(`${v.label}: ${v.previous} → ${v.current}`);
  }

  const meds = compareMedicines(prev, curr);
  if (meds.started.length) out.push(`Medication added: ${meds.started.slice(0, 3).join(', ')}`);
  if (meds.stopped.length) out.push(`Medication stopped: ${meds.stopped.slice(0, 3).join(', ')}`);

  const tests = compareTests(prev, curr);
  if (tests.added.length) out.push(`New investigations: ${tests.added.slice(0, 3).join(', ')}`);

  const fu = curr.followUp;
  const fuText = fu ? (clean(fu.duration) ? `review after ${clean(fu.duration)}` : clean(fu.instructions)) : '';
  if (fuText) out.push(`Follow-up: ${fuText}`);

  return out.slice(0, 8);
}

// Structured previous-visit block for the PDF "Previous Visit Comparison" section.
export interface PreviousVisitPdf {
  date: string;
  diagnosis: string[];
  medicines: string[];
  investigations: string[];
  bullets: string[];
}

export function buildPreviousVisitPdf(prev: ReportData, curr: ReportData, date: string): PreviousVisitPdf {
  return {
    date,
    diagnosis: diagnosisNames(prev),
    medicines: previousMedicines(prev).map(m => [m.medicine, m.dose].filter(Boolean).join(' ')).filter(Boolean),
    investigations: testFindings(prev),
    bullets: buildComparisonBullets(prev, curr),
  };
}

export function buildVisitComparison(prev: ReportData, curr: ReportData): VisitComparison {
  const symptoms = compareSymptoms(prev, curr);
  const vitals = compareVitals(prev, curr);
  const medicines = compareMedicines(prev, curr);
  const tests = compareTests(prev, curr);
  const diagnoses = compareDiagnoses(prev, curr);

  const hasAny =
    symptoms.resolved.length > 0 ||
    symptoms.added.length > 0 ||
    symptoms.continuing.length > 0 ||
    vitals.length > 0 ||
    medicines.started.length > 0 ||
    medicines.stopped.length > 0 ||
    medicines.continued.length > 0 ||
    tests.added.length > 0 ||
    tests.removed.length > 0 ||
    tests.continuing.length > 0 ||
    diagnoses.added.length > 0 ||
    diagnoses.removed.length > 0 ||
    diagnoses.continuing.length > 0;

  const progress = buildProgress(symptoms, prev, curr, hasAny);

  return { symptoms, vitals, medicines, tests, diagnoses, progress, hasAny };
}
