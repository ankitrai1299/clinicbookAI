// ─────────────────────────────────────────────────────────────────────────────
// Report intelligence: SOAP derivation, Previous-Consultation Summary, and the
// visit-over-visit comparison ("what changed since last time"). All pure
// functions over the existing ReportData / Consultation models — no new data is
// required, so every past consultation immediately gains these views.
// ─────────────────────────────────────────────────────────────────────────────
import { Consultation, ReportData, MedicationRow } from '../types';

// ── Small formatting helpers ─────────────────────────────────
const clean = (s?: string) => (s || '').trim();

/** "Metformin 500mg · 1-0-1 · 30 days" — a one-line label for a medication row. */
export function medicationLabel(m: MedicationRow): string {
  const dose = m.dose || m.dosage || '';
  return [m.medicine, m.strength, dose, m.frequency, m.timing, m.duration]
    .map(clean)
    .filter(Boolean)
    .join(' · ');
}

/** A stable key for comparing medications across visits (by drug name). */
const medKey = (m: MedicationRow) => clean(m.medicine).toLowerCase();

/** A stable key for comparing free-text clinical items across visits. */
const norm = (s: string) =>
  clean(s)
    .toLowerCase()
    .replace(/[.,;()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Severity ranking so we can tell "worsened" vs "improved" for a shared complaint.
const SEVERITY_RANK: Record<string, number> = {
  mild: 1, minimal: 1, slight: 1,
  moderate: 2,
  severe: 3, marked: 3, intense: 3,
  critical: 4,
};
const severityRank = (s?: string): number => {
  const t = norm(s || '');
  for (const [k, v] of Object.entries(SEVERITY_RANK)) if (t.includes(k)) return v;
  return 0;
};

// ── SOAP derivation ──────────────────────────────────────────
export interface SOAP {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

const bullets = (items: string[]): string => items.map(clean).filter(Boolean).map((i) => `• ${i}`).join('\n');

const complaintsText = (r: ReportData): string[] =>
  (r.chiefComplaints || []).map((c) =>
    [c.complaint, c.duration && `(${c.duration})`, c.severity && `— ${c.severity}`].filter(Boolean).join(' '),
  );

const vitalsText = (r: ReportData): string[] => {
  const v = r.clinicalMeasurements || ({} as any);
  const pairs: [string, string][] = [
    ['BP', v.bloodPressure], ['Pulse', v.pulse], ['Temp', v.temperature], ['SpO₂', v.spo2],
    ['Blood Sugar', v.bloodSugar], ['Ht', v.height], ['Wt', v.weight], ['BMI', v.bmi],
    ['Pain', v.painScore], ['Other', v.other],
  ];
  return pairs.filter(([, val]) => clean(val)).map(([k, val]) => `${k}: ${val}`);
};

const groupsText = (groups: { name: string; findings: string[] }[]): string[] =>
  (groups || []).flatMap((g) => (g.findings || []).filter(Boolean).map((f) => (g.name ? `${g.name}: ${f}` : f)));

/** Map the 18-section clinical report onto a classic SOAP note. */
export function deriveSOAP(r: ReportData): SOAP {
  const subjective = [
    complaintsText(r).length ? 'Chief Complaints:\n' + bullets(complaintsText(r)) : '',
    r.historyOfPresentIllness?.length ? 'History of Present Illness:\n' + bullets(r.historyOfPresentIllness) : '',
    r.pastMedicalHistory?.length ? 'Past Medical History:\n' + bullets(r.pastMedicalHistory) : '',
    (r.allergies || []).length ? 'Allergies:\n' + bullets(r.allergies.map((a) => [a.allergy, a.reaction, a.severity].filter(Boolean).join(' — '))) : '',
  ].filter(Boolean).join('\n\n');

  const objective = [
    vitalsText(r).length ? 'Vitals:\n' + bullets(vitalsText(r)) : '',
    (r.physicalExamination || []).length ? 'Examination:\n' + bullets(groupsText(r.physicalExamination)) : '',
    (r.reviewOfSystems || []).length ? 'Review of Systems:\n' + bullets(groupsText(r.reviewOfSystems)) : '',
  ].filter(Boolean).join('\n\n');

  const assessment = [
    r.assessment?.length ? bullets(r.assessment) : '',
    r.redFlags?.length ? 'Red Flags:\n' + bullets(r.redFlags) : '',
  ].filter(Boolean).join('\n\n');

  const plan = [
    (r.prescribedMedications || []).length ? 'Medications:\n' + bullets(r.prescribedMedications.map(medicationLabel)) : '',
    (r.ordersDiagnostics || []).length ? 'Investigations:\n' + bullets(groupsText(r.ordersDiagnostics)) : '',
    r.advice?.length ? 'Advice:\n' + bullets(r.advice) : '',
    followUpText(r).length ? 'Follow-up:\n' + bullets(followUpText(r)) : '',
  ].filter(Boolean).join('\n\n');

  return { subjective, objective, assessment, plan };
}

const followUpText = (r: ReportData): string[] => {
  const f = r.followUp || ({} as any);
  return [
    f.date && `Date: ${f.date}`,
    f.duration && `In: ${f.duration}`,
    f.reports && `Reports: ${f.reports}`,
    f.instructions && f.instructions,
  ].filter(Boolean) as string[];
};

// ── Previous-consultation summary ────────────────────────────
export interface ConsultationSummary {
  diagnosis: string[];
  medicines: string[];
  symptoms: string[];
  investigations: string[];
  followUp: string[];
  date?: string;
}

/** Pull the doctor-facing highlights out of one consultation's report. */
export function summarizeConsultation(c: Consultation): ConsultationSummary {
  const r = c.report;
  if (!r) return { diagnosis: [], medicines: [], symptoms: [], investigations: [], followUp: [], date: c.date };
  return {
    diagnosis: (r.assessment || []).map(clean).filter(Boolean),
    medicines: (r.prescribedMedications || []).map(medicationLabel).filter(Boolean),
    symptoms: complaintsText(r).filter(Boolean),
    investigations: groupsText(r.ordersDiagnostics || []),
    followUp: followUpText(r),
    date: c.date,
  };
}

// ── Time helpers (mirror the rest of the app) ────────────────
const sessionTime = (c: Consultation): number => {
  const raw = c?.updatedAt || c?.createdAt || c?.date;
  const parsed = raw ? Date.parse(raw) : NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
};

/**
 * All prior consultations for the same patient, most-recent first, excluding the
 * current one and anything newer than it. Every patient keeps unlimited history.
 */
export function previousConsultations(current: Consultation, all: Consultation[]): Consultation[] {
  const key = current.patientId || current.patientName;
  const t = sessionTime(current);
  return all
    .filter((c) => c.id !== current.id && (c.patientId || c.patientName) === key && sessionTime(c) <= t)
    .sort((a, b) => sessionTime(b) - sessionTime(a));
}

/** The single most-recent prior consultation that actually has a report. */
export function lastConsultationWithReport(current: Consultation, all: Consultation[]): Consultation | null {
  return previousConsultations(current, all).find((c) => !!c.report) || null;
}

// ── Visit-over-visit comparison ("intelligence") ─────────────
export interface VisitComparison {
  symptomsImproved: string[];  // present before, gone now (resolved)
  symptomsWorsened: string[];  // shared complaint, severity increased
  newComplaints: string[];     // present now, not before
  medicationChanges: { added: string[]; stopped: string[]; continued: string[] };
  diagnosisChanges: { added: string[]; resolved: string[] };
  hasChanges: boolean;
}

/** Compare the current report against the previous consultation's report. */
export function compareReports(current: ReportData, prev: ReportData): VisitComparison {
  // Complaints keyed by the complaint text.
  const curC = current.chiefComplaints || [];
  const prevC = prev.chiefComplaints || [];
  const curCKeys = new Set(curC.map((c) => norm(c.complaint)).filter(Boolean));
  const prevCKeys = new Set(prevC.map((c) => norm(c.complaint)).filter(Boolean));

  const symptomsImproved = prevC
    .filter((c) => norm(c.complaint) && !curCKeys.has(norm(c.complaint)))
    .map((c) => c.complaint.trim());

  const newComplaints = curC
    .filter((c) => norm(c.complaint) && !prevCKeys.has(norm(c.complaint)))
    .map((c) => c.complaint.trim());

  const symptomsWorsened: string[] = [];
  for (const c of curC) {
    const p = prevC.find((x) => norm(x.complaint) === norm(c.complaint) && norm(c.complaint));
    if (p && severityRank(c.severity) > severityRank(p.severity)) {
      symptomsWorsened.push(`${c.complaint.trim()} (${p.severity || '—'} → ${c.severity || '—'})`);
    }
  }

  // Medications keyed by drug name.
  const curMeds = current.prescribedMedications || [];
  const prevMeds = prev.prescribedMedications || [];
  const curMedKeys = new Set(curMeds.map(medKey).filter(Boolean));
  const prevMedKeys = new Set(prevMeds.map(medKey).filter(Boolean));

  const added = curMeds.filter((m) => medKey(m) && !prevMedKeys.has(medKey(m))).map(medicationLabel);
  const stopped = prevMeds.filter((m) => medKey(m) && !curMedKeys.has(medKey(m))).map(medicationLabel);
  const continued = curMeds.filter((m) => medKey(m) && prevMedKeys.has(medKey(m))).map(medicationLabel);

  // Diagnoses keyed by normalized text.
  const curDx = (current.assessment || []).map(clean).filter(Boolean);
  const prevDx = (prev.assessment || []).map(clean).filter(Boolean);
  const curDxKeys = new Set(curDx.map(norm));
  const prevDxKeys = new Set(prevDx.map(norm));
  const dxAdded = curDx.filter((d) => !prevDxKeys.has(norm(d)));
  const dxResolved = prevDx.filter((d) => !curDxKeys.has(norm(d)));

  const hasChanges =
    symptomsImproved.length > 0 || symptomsWorsened.length > 0 || newComplaints.length > 0 ||
    added.length > 0 || stopped.length > 0 || dxAdded.length > 0 || dxResolved.length > 0;

  return {
    symptomsImproved,
    symptomsWorsened,
    newComplaints,
    medicationChanges: { added, stopped, continued },
    diagnosisChanges: { added: dxAdded, resolved: dxResolved },
    hasChanges,
  };
}
