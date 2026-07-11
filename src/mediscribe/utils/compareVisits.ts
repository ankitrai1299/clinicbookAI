// Compare Previous Visit — a pure, read-only helper that diffs the CURRENT
// consultation's report against the patient's immediately previous visit.
//
// This module creates/duplicates nothing and touches no API, database, report
// generation, transcription or session logic. It only reads two already-loaded
// ReportData objects (same patient) and returns a structured diff the UI renders.

import { ReportData, Vitals } from '../types';
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
  progress: { label: 'Improving' | 'Needs attention' | 'Mixed' | 'Stable'; summary: string } | null;
  // True when at least one section has something to show.
  hasAny: boolean;
}

const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const norm = (v: string): string => v.trim().toLowerCase();

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

export function buildVisitComparison(prev: ReportData, curr: ReportData): VisitComparison {
  const symptoms = compareSymptoms(prev, curr);
  const vitals = compareVitals(prev, curr);
  const medicines = compareMedicines(prev, curr);
  const tests = compareTests(prev, curr);

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
    tests.continuing.length > 0;

  const progress = buildProgress(symptoms, prev, curr, hasAny);

  return { symptoms, vitals, medicines, tests, progress, hasAny };
}
