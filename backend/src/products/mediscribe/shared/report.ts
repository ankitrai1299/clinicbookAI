import {
  ReportData,
  MedicationRow,
  ComplaintRow,
  AllergyRow,
  SystemGroup,
  Vitals,
  FollowUp,
} from './types.js';

// The kinds of content a Premium Clinical Report section can hold. The editor,
// the print/HTML export and the PDF/DOCX exports all switch on this.
export type ReportSectionKind =
  | 'overview' // single AI-written paragraph
  | 'bullets' // string[]
  | 'complaints' // ComplaintRow[]
  | 'allergies' // AllergyRow[]
  | 'medications' // MedicationRow[] (columns chosen per section)
  | 'vitals' // Vitals (key/value)
  | 'groups' // SystemGroup[] (named groups of findings)
  | 'followup'; // FollowUp (key/value)

export interface ColumnDef {
  key: string;
  label: string;
}

export interface ReportSectionDef {
  key: keyof ReportData;
  no: number;
  title: string;
  kind: ReportSectionKind;
  // Editable sections show input controls in the editor and are always visible
  // there (so the doctor can add data). Read-only sections render as static text
  // and are hidden when empty.
  editable: boolean;
  // Column set for `medications` sections.
  columns?: ColumnDef[];
}

// ── Column / field configs ───────────────────────────────────
export const COMPLAINT_COLUMNS: ColumnDef[] = [
  { key: 'complaint', label: 'Complaint' },
  { key: 'duration', label: 'Duration' },
  { key: 'severity', label: 'Severity' },
];

export const ALLERGY_COLUMNS: ColumnDef[] = [
  { key: 'allergy', label: 'Allergy' },
  { key: 'reaction', label: 'Reaction' },
  { key: 'severity', label: 'Severity' },
];

// Current medications the patient is already taking.
export const MED_HISTORY_COLUMNS: ColumnDef[] = [
  { key: 'medicine', label: 'Medicine' },
  { key: 'strength', label: 'Strength' },
  { key: 'dose', label: 'Dose' },
  { key: 'route', label: 'Route' },
  { key: 'frequency', label: 'Frequency' },
  { key: 'timing', label: 'Timing' },
  { key: 'purpose', label: 'Purpose' },
  { key: 'compliance', label: 'Compliance' },
];

// Medicines prescribed / changed in this visit (treatment plan).
export const TREATMENT_COLUMNS: ColumnDef[] = [
  { key: 'medicine', label: 'Medicine' },
  { key: 'strength', label: 'Strength' },
  { key: 'dose', label: 'Dose' },
  { key: 'route', label: 'Route' },
  { key: 'frequency', label: 'Frequency' },
  { key: 'timing', label: 'Timing' },
  { key: 'duration', label: 'Duration' },
  { key: 'instructions', label: 'Instructions' },
];

export const VITALS_FIELDS: { key: keyof Vitals; label: string }[] = [
  { key: 'bloodPressure', label: 'Blood Pressure' },
  { key: 'pulse', label: 'Pulse' },
  { key: 'temperature', label: 'Temperature' },
  { key: 'spo2', label: 'SpO₂' },
  { key: 'bloodSugar', label: 'Blood Sugar' },
  { key: 'height', label: 'Height' },
  { key: 'weight', label: 'Weight' },
  { key: 'bmi', label: 'BMI' },
  { key: 'painScore', label: 'Pain Score' },
  { key: 'other', label: 'Other' },
];

export const FOLLOWUP_FIELDS: { key: keyof FollowUp; label: string }[] = [
  { key: 'date', label: 'Follow-up Date' },
  { key: 'duration', label: 'Duration' },
  { key: 'reports', label: 'Required Reports' },
  { key: 'instructions', label: 'Next Visit Instructions' },
];

// Single source of truth for the Premium Clinical Report structure — used by the
// editor, the PDF/DOCX exports, the print HTML, the empty-report builder and the
// normalizer.
export const REPORT_SECTIONS: ReportSectionDef[] = [
  { key: 'clinicalOverview', no: 1, title: 'Patient Clinical Overview', kind: 'overview', editable: false },
  { key: 'chiefComplaints', no: 2, title: 'Chief Complaints', kind: 'complaints', editable: false },
  { key: 'historyOfPresentIllness', no: 3, title: 'History of Present Illness', kind: 'bullets', editable: false },
  { key: 'pastMedicalHistory', no: 4, title: 'Past Medical History', kind: 'bullets', editable: false },
  { key: 'surgicalHistory', no: 5, title: 'Surgical / Procedure History', kind: 'bullets', editable: false },
  { key: 'medicationHistory', no: 6, title: 'Medication History', kind: 'medications', editable: true, columns: MED_HISTORY_COLUMNS },
  { key: 'allergies', no: 7, title: 'Allergy Profile', kind: 'allergies', editable: false },
  { key: 'familyHistory', no: 8, title: 'Family History', kind: 'bullets', editable: false },
  { key: 'socialHistory', no: 9, title: 'Social & Lifestyle History', kind: 'bullets', editable: false },
  { key: 'reviewOfSystems', no: 10, title: 'Review of Systems', kind: 'groups', editable: false },
  { key: 'clinicalMeasurements', no: 11, title: 'Clinical Measurements', kind: 'vitals', editable: true },
  { key: 'physicalExamination', no: 12, title: 'Physical Examination Findings', kind: 'groups', editable: false },
  { key: 'assessment', no: 13, title: 'Clinical Impression / Assessment', kind: 'bullets', editable: false },
  { key: 'prescribedMedications', no: 14, title: 'Treatment & Medication Plan', kind: 'medications', editable: true, columns: TREATMENT_COLUMNS },
  { key: 'ordersDiagnostics', no: 15, title: 'Orders & Diagnostic Plan', kind: 'groups', editable: false },
  { key: 'advice', no: 16, title: 'Care Plan & Patient Instructions', kind: 'bullets', editable: true },
  { key: 'redFlags', no: 17, title: 'Warning Signs / Red Flags', kind: 'bullets', editable: false },
  { key: 'followUp', no: 18, title: 'Follow-up Plan', kind: 'followup', editable: true },
];

// ── Empty-value builders ─────────────────────────────────────
export function emptyMedicationRow(): MedicationRow {
  return {
    medicine: '', strength: '', dose: '', route: '', frequency: '',
    timing: '', duration: '', instructions: '', purpose: '', compliance: '',
  };
}

export function emptyComplaintRow(): ComplaintRow {
  return { complaint: '', duration: '', severity: '' };
}

export function emptyAllergyRow(): AllergyRow {
  return { allergy: '', reaction: '', severity: '' };
}

export function emptyGroup(): SystemGroup {
  return { name: '', findings: [] };
}

export function emptyVitals(): Vitals {
  return {
    bloodPressure: '', pulse: '', temperature: '', spo2: '', bloodSugar: '',
    height: '', weight: '', bmi: '', painScore: '', other: '',
  };
}

export function emptyFollowUp(): FollowUp {
  return { date: '', duration: '', reports: '', instructions: '' };
}

/** Build a fully-empty report matching the section config. */
export function createEmptyReport(): ReportData {
  return {
    clinicalOverview: '',
    chiefComplaints: [],
    historyOfPresentIllness: [],
    pastMedicalHistory: [],
    surgicalHistory: [],
    medicationHistory: [],
    allergies: [],
    familyHistory: [],
    socialHistory: [],
    reviewOfSystems: [],
    clinicalMeasurements: emptyVitals(),
    physicalExamination: [],
    assessment: [],
    prescribedMedications: [],
    ordersDiagnostics: [],
    advice: [],
    redFlags: [],
    followUp: emptyFollowUp(),
    notes: '',
    chiefComplaint: [],
  };
}

// ── Normalization helpers ────────────────────────────────────
const str = (v: any): string => (typeof v === 'string' ? v : '');

const cleanList = (v: any): string[] =>
  Array.isArray(v) ? v.filter(x => typeof x === 'string').map(x => x.trim()).filter(Boolean) : [];

function normalizeMedication(m: any): MedicationRow {
  return {
    medicine: str(m?.medicine),
    strength: str(m?.strength),
    // Migrate the legacy `dosage` field into `dose`.
    dose: str(m?.dose) || str(m?.dosage),
    route: str(m?.route),
    frequency: str(m?.frequency),
    timing: str(m?.timing),
    duration: str(m?.duration),
    instructions: str(m?.instructions),
    purpose: str(m?.purpose),
    compliance: str(m?.compliance),
  };
}

const normalizeMeds = (v: any): MedicationRow[] =>
  Array.isArray(v)
    ? v.map(normalizeMedication).filter(m => Object.values(m).some(Boolean))
    : [];

function normalizeComplaints(input: any): ComplaintRow[] {
  // New shape: array of {complaint, duration, severity}.
  if (Array.isArray(input)) {
    return input
      .map((c: any) =>
        typeof c === 'string'
          ? { complaint: c.trim(), duration: '', severity: '' }
          : { complaint: str(c?.complaint), duration: str(c?.duration), severity: str(c?.severity) },
      )
      .filter(c => Object.values(c).some(Boolean));
  }
  return [];
}

function normalizeAllergies(v: any): AllergyRow[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((a: any) =>
      typeof a === 'string'
        ? { allergy: a.trim(), reaction: '', severity: '' }
        : { allergy: str(a?.allergy), reaction: str(a?.reaction), severity: str(a?.severity) },
    )
    .filter(a => Object.values(a).some(Boolean));
}

function normalizeGroups(v: any): SystemGroup[] {
  if (!Array.isArray(v)) return [];
  // New shape: [{name, findings: []}]. Legacy shape: ["string", ...].
  if (v.length && typeof v[0] === 'string') {
    const findings = cleanList(v);
    return findings.length ? [{ name: 'General', findings }] : [];
  }
  return v
    .map((g: any) => ({ name: str(g?.name).trim(), findings: cleanList(g?.findings) }))
    .filter(g => g.name || g.findings.length);
}

function normalizeVitals(v: any, legacyVitalSigns: any): Vitals {
  const base = emptyVitals();
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const f of VITALS_FIELDS) base[f.key] = str(v[f.key]);
  }
  // Migrate the old flat `vitalSigns` string[] into the free-text "Other" slot
  // if structured measurements weren't provided.
  if (!Object.values(base).some(Boolean)) {
    const legacy = cleanList(legacyVitalSigns);
    if (legacy.length) base.other = legacy.join('; ');
  }
  return base;
}

function normalizeFollowUp(v: any): FollowUp {
  const base = emptyFollowUp();
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const f of FOLLOWUP_FIELDS) base[f.key] = str(v[f.key]);
  } else if (Array.isArray(v)) {
    // Legacy/loose: an array of advice lines → instructions.
    const lines = cleanList(v);
    if (lines.length) base.instructions = lines.join('; ');
  }
  return base;
}

/**
 * Merge an arbitrary (possibly partial, possibly legacy EkaScribe-shaped) object
 * onto a full empty Premium report. Migrates old fields where possible and
 * always derives the `chiefComplaint` compatibility projection.
 */
export function normalizeReport(input: any): ReportData {
  const base = createEmptyReport();
  if (!input || typeof input !== 'object') return base;

  base.clinicalOverview = str(input.clinicalOverview);

  base.chiefComplaints = normalizeComplaints(
    // Prefer the new structured field; fall back to legacy `chiefComplaint`.
    input.chiefComplaints ?? input.chiefComplaint,
  );

  base.historyOfPresentIllness = cleanList(input.historyOfPresentIllness);
  base.pastMedicalHistory = cleanList(input.pastMedicalHistory);
  base.surgicalHistory = cleanList(input.surgicalHistory);
  base.medicationHistory = normalizeMeds(input.medicationHistory);
  base.allergies = normalizeAllergies(input.allergies);
  base.familyHistory = cleanList(input.familyHistory);
  base.socialHistory = cleanList(input.socialHistory);
  base.reviewOfSystems = normalizeGroups(input.reviewOfSystems);
  base.clinicalMeasurements = normalizeVitals(input.clinicalMeasurements, input.vitalSigns);
  base.physicalExamination = normalizeGroups(input.physicalExamination);
  base.assessment = cleanList(input.assessment);
  base.prescribedMedications = normalizeMeds(input.prescribedMedications);
  // New structured orders; fall back to migrating the legacy investigations list.
  base.ordersDiagnostics = input.ordersDiagnostics
    ? normalizeGroups(input.ordersDiagnostics)
    : (() => {
        const inv = cleanList(input.prescribedInvestigations);
        return inv.length ? [{ name: 'Investigations', findings: inv }] : [];
      })();
  base.advice = cleanList(input.advice);
  base.redFlags = cleanList(input.redFlags);
  base.followUp = normalizeFollowUp(input.followUp);
  base.notes = str(input.notes);

  // Compatibility projection consumed by the dashboard / patient views / search.
  base.chiefComplaint = base.chiefComplaints.map(c =>
    [c.complaint, c.duration, c.severity].map(x => x.trim()).filter(Boolean).join(' — '),
  );

  return base;
}

// ── Content presence (drives "never show empty sections") ────
export function sectionHasContent(report: ReportData, section: ReportSectionDef): boolean {
  const v = report[section.key];
  switch (section.kind) {
    case 'overview':
      return !!str(v).trim();
    case 'bullets':
      return Array.isArray(v) && (v as string[]).some(x => x && x.trim());
    case 'complaints':
    case 'allergies':
    case 'medications':
      return Array.isArray(v) && v.length > 0;
    case 'groups':
      return Array.isArray(v) && (v as SystemGroup[]).some(g => g.findings.length > 0 || g.name.trim());
    case 'vitals':
    case 'followup':
      return !!v && Object.values(v as object).some(x => typeof x === 'string' && x.trim());
    default:
      return false;
  }
}

/** Plain-text summary of a medication table (used by list views). */
export function medicationsToText(rows: MedicationRow[] | undefined): string {
  if (!rows || rows.length === 0) return '';
  return rows
    .map(r =>
      [r.medicine, r.strength, r.dose || r.dosage, r.route, r.frequency, r.timing, r.duration, r.instructions]
        .filter(Boolean)
        .join(' — '),
    )
    .filter(Boolean)
    .join('\n');
}

// ── Print / PDF HTML ─────────────────────────────────────────
function escapeHtml(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface ReportMeta {
  patientName?: string;
  date?: string;
  doctorName?: string;
}

function tableHtml(columns: ColumnDef[], rows: Record<string, any>[]): string {
  const head = columns.map(c => `<th>${escapeHtml(c.label)}</th>`).join('');
  const body = rows
    .map(
      r =>
        `<tr>${columns
          .map(c => `<td>${escapeHtml(str(r[c.key]) || (c.key === 'dose' ? str(r.dosage) : ''))}</td>`)
          .join('')}</tr>`,
    )
    .join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function sectionBodyHtml(report: ReportData, s: ReportSectionDef): string {
  const v = report[s.key];
  switch (s.kind) {
    case 'overview':
      return `<p class="overview">${escapeHtml(str(v)).replace(/\n/g, '<br/>')}</p>`;
    case 'bullets':
      return `<ul>${(v as string[]).map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`;
    case 'complaints':
      return tableHtml(COMPLAINT_COLUMNS, v as ComplaintRow[]);
    case 'allergies':
      return tableHtml(ALLERGY_COLUMNS, v as AllergyRow[]);
    case 'medications':
      return tableHtml(s.columns || TREATMENT_COLUMNS, v as MedicationRow[]);
    case 'groups':
      return (v as SystemGroup[])
        .filter(g => g.findings.length || g.name.trim())
        .map(
          g =>
            `<div class="group"><div class="group-name">${escapeHtml(g.name)}</div>` +
            `<ul>${g.findings.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul></div>`,
        )
        .join('');
    case 'vitals': {
      const vitals = v as Vitals;
      const rows = VITALS_FIELDS.filter(f => str(vitals[f.key]).trim())
        .map(f => `<tr><th>${escapeHtml(f.label)}</th><td>${escapeHtml(vitals[f.key])}</td></tr>`)
        .join('');
      return `<table class="kv">${rows}</table>`;
    }
    case 'followup': {
      const fu = v as FollowUp;
      const rows = FOLLOWUP_FIELDS.filter(f => str(fu[f.key]).trim())
        .map(f => `<tr><th>${escapeHtml(f.label)}</th><td>${escapeHtml(fu[f.key])}</td></tr>`)
        .join('');
      return `<table class="kv">${rows}</table>`;
    }
    default:
      return '';
  }
}

/** Build a clean, paginating A4 HTML document for the report (print / PDF export). */
export function buildReportHtml(report: ReportData, meta: ReportMeta = {}): string {
  let n = 0;
  const sectionsHtml = REPORT_SECTIONS.filter(s => sectionHasContent(report, s))
    .map(s => {
      n += 1;
      return `<section>
        <h2>${n}. ${escapeHtml(s.title)}</h2>
        ${sectionBodyHtml(report, s)}
      </section>`;
    })
    .join('');

  const sub = [meta.patientName, meta.date].filter((v): v is string => !!v).map(escapeHtml).join('  •  ');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Clinical Report</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; font-size: 12px; line-height: 1.5; background: #fff; margin: 0; }
  .header { text-align: center; border-bottom: 2px solid #1d4ed8; padding-bottom: 10px; margin-bottom: 16px; }
  h1 { font-size: 19px; margin: 0 0 3px; letter-spacing: 0.5px; color: #0f172a; }
  .brand { color: #1d4ed8; font-weight: 700; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; }
  .sub { color: #475569; font-size: 11.5px; margin-top: 4px; }
  section { margin-bottom: 13px; page-break-inside: avoid; }
  h2 { font-size: 12.5px; font-weight: 700; color: #1d4ed8; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 3px; margin: 0 0 7px; text-transform: uppercase; letter-spacing: 0.3px; }
  ul { margin: 0; padding-left: 18px; }
  li { padding: 1px 0; }
  .overview { margin: 0; text-align: justify; }
  table { width: 100%; border-collapse: collapse; margin-top: 2px; }
  th, td { border: 1px solid #cbd5e1; padding: 5px 7px; text-align: left; vertical-align: top; font-size: 10.5px; }
  thead th { background: #eff6ff; font-weight: 700; letter-spacing: 0.2px; color: #1e3a8a; }
  table.kv { width: auto; }
  table.kv th { background: #f8fafc; width: 160px; white-space: nowrap; }
  .group { margin-bottom: 6px; }
  .group-name { font-weight: 700; color: #334155; font-size: 11.5px; margin-bottom: 2px; }
  .signature { margin-top: 36px; page-break-inside: avoid; display: flex; justify-content: flex-end; }
  .signature .box { width: 240px; text-align: center; border-top: 1px solid #334155; padding-top: 5px; font-size: 11px; color: #334155; }
  .signature .name { font-weight: 700; color: #0f172a; }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">NovaScribe AI</div>
    <h1>Clinical Report</h1>
    ${sub ? `<div class="sub">${sub}</div>` : ''}
  </div>
  ${sectionsHtml}
  <div class="signature">
    <div class="box">
      <div class="name">${escapeHtml(meta.doctorName || 'Attending Physician')}</div>
      <div>Doctor's Signature</div>
    </div>
  </div>
</body>
</html>`;
}
