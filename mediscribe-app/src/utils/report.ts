import {
  ReportData,
  MedicationRow,
  ComplaintRow,
  AllergyRow,
  SystemGroup,
  Vitals,
  FollowUp,
} from '../types';
// Type-only: compareVisits imports VITALS_FIELDS/normalizeReport from this file,
// so a value import would close a require cycle. `import type` is erased.
import type { VisitComparison } from './compareVisits';
import i18n from '../i18n';

// ── Report label localization ────────────────────────────────
// The clinical report's section titles, table headers and field labels are
// authored once in English here. When the doctor's app is set to Hindi, the LLM
// already writes the section *content* in Hindi (see server report.ts); this map
// makes the surrounding *labels* Hindi too, so the whole document — on screen,
// in the PDF, DOCX and text exports — reads in one language.
//
// Deliberately NOT translated: drug names, lab/test abbreviations and units
// (mg, ml, BP, SpO₂, BMI) — the same safety rule the report content follows.
const HI_LABELS: Record<string, string> = {
  // Section titles (must match REPORT_SECTIONS titles exactly)
  'Patient Clinical Overview': 'रोगी नैदानिक अवलोकन',
  'Chief Complaints': 'मुख्य शिकायतें',
  'History of Present Illness': 'वर्तमान बीमारी का इतिहास',
  'Past Medical History': 'पूर्व चिकित्सा इतिहास',
  'Surgical / Procedure History': 'शल्य / प्रक्रिया इतिहास',
  'Medication History': 'दवा का इतिहास',
  'Allergy Profile': 'एलर्जी प्रोफ़ाइल',
  'Family History': 'पारिवारिक इतिहास',
  'Social & Lifestyle History': 'सामाजिक और जीवनशैली इतिहास',
  'Review of Systems': 'प्रणालियों की समीक्षा',
  'Clinical Measurements': 'नैदानिक मापन',
  'Physical Examination Findings': 'शारीरिक परीक्षण निष्कर्ष',
  'Clinical Impression / Assessment': 'नैदानिक आकलन',
  'Treatment & Medication Plan': 'उपचार एवं दवा योजना',
  'Orders & Diagnostic Plan': 'जाँच एवं निदान योजना',
  'Care Plan & Patient Instructions': 'देखभाल योजना एवं रोगी निर्देश',
  'Warning Signs / Red Flags': 'चेतावनी के संकेत',
  'Follow-up Plan': 'अनुवर्ती योजना',
  // Short section headings — what the printed prescription/report actually
  // prints (the long titles above stay on the editor's section list).
  Summary: 'सारांश',
  'Chief Complaint': 'मुख्य शिकायत',
  History: 'इतिहास',
  'Past History': 'पूर्व इतिहास',
  'Surgical History': 'शल्य इतिहास',
  'Current Medicines': 'वर्तमान दवाएँ',
  Allergies: 'एलर्जी',
  Lifestyle: 'जीवनशैली',
  Vitals: 'वाइटल्स',
  Examination: 'परीक्षण',
  Prescription: 'दवा पर्ची',
  Investigations: 'जाँचें',
  Advice: 'सलाह',
  'Red Flags': 'चेतावनी संकेत',
  'Follow-up': 'अगली मुलाकात',
  // Short vitals labels (the compact vitals cards)
  Temp: 'तापमान',
  BP: 'रक्तचाप',
  Sugar: 'शर्करा',
  Pain: 'दर्द',
  // Table column headers
  Complaint: 'शिकायत',
  Duration: 'अवधि',
  Severity: 'गंभीरता',
  Allergy: 'एलर्जी',
  Reaction: 'प्रतिक्रिया',
  Medicine: 'दवा',
  Strength: 'मात्रा',
  Dose: 'खुराक',
  Route: 'मार्ग',
  Frequency: 'आवृत्ति',
  Timing: 'समय',
  Purpose: 'उद्देश्य',
  Compliance: 'पालन',
  Instructions: 'निर्देश',
  // Vitals labels
  'Blood Pressure': 'रक्तचाप',
  Pulse: 'नाड़ी',
  Temperature: 'तापमान',
  'Blood Sugar': 'रक्त शर्करा',
  Height: 'ऊँचाई',
  Weight: 'वज़न',
  'Pain Score': 'दर्द स्कोर',
  Other: 'अन्य',
  // Follow-up labels
  'Follow-up Date': 'अगली मुलाकात की तिथि',
  'Required Reports': 'आवश्यक रिपोर्ट',
  'Next Visit Instructions': 'अगली मुलाकात के निर्देश',
  // Patient information block
  'Patient Information': 'रोगी की जानकारी',
  'Patient Name': 'रोगी का नाम',
  Age: 'आयु',
  Gender: 'लिंग',
  'Phone Number': 'फ़ोन नंबर',
  'Consultation Date': 'परामर्श तिथि',
  'Consultation Time': 'परामर्श समय',
  'Patient ID': 'रोगी आईडी',
  'Transcription Language': 'ट्रांसक्रिप्शन भाषा',
  'Age / Sex': 'आयु / लिंग',
  Sex: 'लिंग',
  Phone: 'फ़ोन',
  Language: 'भाषा',
  // Letterhead
  'Consultation ID': 'परामर्श आईडी',
  Date: 'तिथि',
  Patient: 'रोगी',
  // SOAP
  'SOAP Summary': 'SOAP सारांश',
  Subjective: 'व्यक्तिपरक',
  Objective: 'वस्तुनिष्ठ',
  Assessment: 'आकलन',
  Plan: 'योजना',
  // Previous consultation summary
  'Previous Consultation Summary': 'पिछले परामर्श का सारांश',
  'Previous Symptoms': 'पिछले लक्षण',
  'Previous Diagnosis': 'पिछला निदान',
  'Previous Medicines': 'पिछली दवाएँ',
  'Previous Investigations': 'पिछली जाँचें',
  'Previous Follow-up': 'पिछली अनुवर्ती',
  // Previous-visit comparison
  'Since Last Visit': 'पिछली मुलाकात से',
  'Compare Previous Visit': 'पिछली मुलाकात से तुलना',
  vs: 'बनाम',
  Symptoms: 'लक्षण',
  Medicines: 'दवाएँ',
  Tests: 'जाँचें',
  New: 'नए',
  Resolved: 'ठीक हुए',
  Continuing: 'जारी',
  Started: 'शुरू की',
  Stopped: 'बंद की',
  Continued: 'जारी रखी',
  'No longer noted': 'अब दर्ज नहीं',
  Improving: 'सुधार',
  'Needs attention': 'ध्यान दें',
  Mixed: 'मिश्रित',
  Stable: 'स्थिर',
  'Symptom Changes': 'लक्षणों में बदलाव',
  'Vital Changes': 'वाइटल्स में बदलाव',
  'Medicine Changes': 'दवाओं में बदलाव',
  'Test Result Changes': 'जाँचों में बदलाव',
  'Overall Health Progress': 'समग्र स्वास्थ्य प्रगति',
  'No previous visit available for comparison.': 'तुलना के लिए पिछली मुलाकात उपलब्ध नहीं है।',
  'Generate the current report to compare it with the previous visit.':
    'पिछली मुलाकात से तुलना के लिए पहले वर्तमान रिपोर्ट बनाएँ।',
  'No comparable changes between these two visits.':
    'इन दो मुलाकातों के बीच तुलना योग्य कोई बदलाव नहीं।',
  // Progress summary fragments (assembled in compareVisits.buildProgress)
  'Since the previous visit:': 'पिछली मुलाकात से:',
  'symptom resolved': 'लक्षण ठीक हुआ',
  'symptoms resolved': 'लक्षण ठीक हुए',
  'new symptom': 'नया लक्षण',
  'new symptoms': 'नए लक्षण',
  ongoing: 'जारी',
  'pain score lower': 'दर्द स्कोर कम',
  'pain score higher': 'दर्द स्कोर अधिक',
  'Findings are largely unchanged since the previous visit.':
    'पिछली मुलाकात से निष्कर्ष लगभग अपरिवर्तित हैं।',
  // Sentence terminator — a danda in Hindi.
  '.': '।',
  // Document chrome
  'Clinical Consultation Report': 'नैदानिक परामर्श रिपोर्ट',
  'Clinical Report': 'नैदानिक रिपोर्ट',
  'Consultation Transcript': 'परामर्श ट्रांसक्रिप्ट',
  Doctor: 'डॉक्टर',
  "Doctor's Signature": 'डॉक्टर के हस्ताक्षर',
  'Attending Physician': 'उपस्थित चिकित्सक',
  'Generated by NovaScribe • This is a computer-generated clinical document.':
    'NovaScribe द्वारा निर्मित • यह एक कंप्यूटर-जनित नैदानिक दस्तावेज़ है।',
  // On-screen report editor chrome
  Editable: 'संपादन योग्य',
  'Read-only': 'केवल-पठन',
  'Add to report': 'रिपोर्ट में जोड़ें',
};

/**
 * Localize a fixed report label. Returns the Hindi label when the app language
 * is Hindi and a translation exists; otherwise the original English (so any
 * label not in the map, e.g. a unit-only header, is safely passed through).
 */
export function L(label: string): string {
  if (i18n.language !== 'hi') return label;
  return HI_LABELS[label] ?? label;
}

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
  // Heading used on the DOCUMENT (printed report, PDF and its on-screen
  // preview), where a prescription reads better with clinical shorthand —
  // "Vitals", "Prescription", "Advice". `title` stays the long, unambiguous
  // name and is what the editor's section list shows.
  short?: string;
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

// `short` is what the compact vitals cards print ("BP", "Temp"); `label` is the
// full name used by the editor, the comparison rows and the text/DOCX exports.
export const VITALS_FIELDS: { key: keyof Vitals; label: string; short?: string }[] = [
  { key: 'temperature', label: 'Temperature', short: 'Temp' },
  { key: 'bloodPressure', label: 'Blood Pressure', short: 'BP' },
  { key: 'pulse', label: 'Pulse' },
  { key: 'spo2', label: 'SpO₂' },
  { key: 'bloodSugar', label: 'Blood Sugar', short: 'Sugar' },
  { key: 'height', label: 'Height' },
  { key: 'weight', label: 'Weight' },
  { key: 'bmi', label: 'BMI' },
  { key: 'painScore', label: 'Pain Score', short: 'Pain' },
  { key: 'other', label: 'Other' },
];

/** Compact label for the vitals cards ("Temp", "BP"), localized. */
export const vitalHeading = (f: { label: string; short?: string }): string => L(f.short || f.label);

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
  { key: 'clinicalOverview', no: 1, title: 'Patient Clinical Overview', short: 'Summary', kind: 'overview', editable: false },
  { key: 'chiefComplaints', no: 2, title: 'Chief Complaints', short: 'Chief Complaint', kind: 'complaints', editable: false },
  { key: 'historyOfPresentIllness', no: 3, title: 'History of Present Illness', short: 'History', kind: 'bullets', editable: false },
  { key: 'pastMedicalHistory', no: 4, title: 'Past Medical History', short: 'Past History', kind: 'bullets', editable: false },
  { key: 'surgicalHistory', no: 5, title: 'Surgical / Procedure History', short: 'Surgical History', kind: 'bullets', editable: false },
  { key: 'medicationHistory', no: 6, title: 'Medication History', short: 'Current Medicines', kind: 'medications', editable: true, columns: MED_HISTORY_COLUMNS },
  { key: 'allergies', no: 7, title: 'Allergy Profile', short: 'Allergies', kind: 'allergies', editable: false },
  { key: 'familyHistory', no: 8, title: 'Family History', kind: 'bullets', editable: false },
  { key: 'socialHistory', no: 9, title: 'Social & Lifestyle History', short: 'Lifestyle', kind: 'bullets', editable: false },
  { key: 'reviewOfSystems', no: 10, title: 'Review of Systems', kind: 'groups', editable: false },
  { key: 'clinicalMeasurements', no: 11, title: 'Clinical Measurements', short: 'Vitals', kind: 'vitals', editable: true },
  { key: 'physicalExamination', no: 12, title: 'Physical Examination Findings', short: 'Examination', kind: 'groups', editable: false },
  { key: 'assessment', no: 13, title: 'Clinical Impression / Assessment', short: 'Assessment', kind: 'bullets', editable: false },
  { key: 'prescribedMedications', no: 14, title: 'Treatment & Medication Plan', short: 'Prescription', kind: 'medications', editable: true, columns: TREATMENT_COLUMNS },
  { key: 'ordersDiagnostics', no: 15, title: 'Orders & Diagnostic Plan', short: 'Investigations', kind: 'groups', editable: false },
  { key: 'advice', no: 16, title: 'Care Plan & Patient Instructions', short: 'Advice', kind: 'bullets', editable: true },
  { key: 'redFlags', no: 17, title: 'Warning Signs / Red Flags', short: 'Red Flags', kind: 'bullets', editable: false },
  { key: 'followUp', no: 18, title: 'Follow-up Plan', short: 'Follow-up', kind: 'followup', editable: true },
];

/** Heading a section prints under on the document (short form when it has one). */
export const sectionHeading = (s: ReportSectionDef): string => L(s.short || s.title);

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

// Placeholders that mean "nothing recorded". Models and typists both emit these
// instead of leaving a field empty, and printing them adds pages of noise that
// say nothing clinically. Treated exactly like an empty string everywhere.
//
// Deliberately NOT in this list, despite looking similar:
//   "no"          — a real answer. Compliance "No" means the patient is not
//                   taking the drug; dropping it inverts the clinical meaning.
//   "nka"/"nkda"  — "no known (drug) allergies" is a positive assertion that
//                   the doctor asked and found none, not an unfilled field.
//   "not assessed"/"not recorded" — these document that something was
//                   deliberately not done, which is itself clinical information.
// Erring toward printing an extra line is far safer than silently deleting a
// finding from a medical record.
const BLANK_PLACEHOLDERS = new Set([
  'nil', 'n/a', 'na', 'n.a.', 'none', '-', '--', '—', '–', '.', '_',
  'not applicable', 'not available', 'no data', 'null', 'undefined',
]);

/**
 * True when a value carries no clinical information.
 *
 * The report is built by filtering on this, so anything it calls blank is
 * omitted from the document entirely rather than rendered as a placeholder.
 */
export function isBlank(v: any): boolean {
  if (v === null || v === undefined) return true;
  const t = String(v).trim();
  if (!t) return true;
  return BLANK_PLACEHOLDERS.has(t.toLowerCase());
}

/** Inverse of isBlank, for readability at call sites. */
export const hasValue = (v: any): boolean => !isBlank(v);

/** A row counts only when at least one of its cells carries real content. */
export const rowHasContent = (row: Record<string, any> | null | undefined): boolean =>
  !!row && Object.values(row).some(hasValue);

/** Drop rows that are entirely blank (the editor seeds empty rows for typing). */
export const nonEmptyRows = <T extends Record<string, any>>(rows: T[] | undefined): T[] =>
  (rows || []).filter(rowHasContent);

/** Drop blank entries from a bullet list. */
export const nonEmptyItems = (items: any[] | undefined): string[] =>
  (items || []).filter(hasValue).map((i) => String(i).trim());

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
    [c.complaint, c.duration, c.severity].map(x => x.trim()).filter(Boolean).join(' - '),
  );

  return base;
}

// ── Content presence (drives "never show empty sections") ────
/**
 * Whether a section carries anything worth printing.
 *
 * This is the single gate the preview, the print view and the PDF all filter
 * on, so a section judged empty here disappears from every surface at once.
 *
 * Note what changed and why: the table kinds used to accept any non-empty
 * array, but the editor seeds a blank row so the doctor has somewhere to type.
 * An untouched "Allergies" therefore held one all-empty row, passed this check,
 * and printed as a header with a row of empty cells. Rows (and group findings)
 * are now judged by their content, not their existence — and `isBlank` means a
 * field filled in with "Nil" or "N/A" counts as empty too.
 */
export function sectionHasContent(report: ReportData, section: ReportSectionDef): boolean {
  const v = report[section.key];
  switch (section.kind) {
    case 'overview':
      return hasValue(str(v));
    case 'bullets':
      return nonEmptyItems(v as string[]).length > 0;
    case 'complaints':
    case 'allergies':
    case 'medications':
      return nonEmptyRows(v as Record<string, any>[]).length > 0;
    case 'groups':
      // A group needs actual findings. A name on its own would print a heading
      // with an empty list under it.
      return Array.isArray(v) && (v as SystemGroup[]).some(g => nonEmptyItems(g.findings).length > 0);
    case 'vitals':
    case 'followup':
      return !!v && Object.values(v as object).some(hasValue);
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
        .join(' - '),
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
  patientMeta?: string; // e.g. "34 yrs • Female"
  date?: string;
  dateTime?: string; // full date + time for the letterhead
  // ── Patient Information block ────────────────────────────────
  // Discrete fields for the boxed section under the report title. Every one is
  // optional and its row is omitted when absent — a clinical document should
  // not print "N/A" against a patient's phone number, because a reader cannot
  // tell "we never asked" from "the patient has no phone".
  patientAge?: number | string;
  patientGender?: string;
  patientPhone?: string;
  patientId?: string;
  consultationDate?: string;
  consultationTime?: string;
  transcriptionLanguage?: string;
  doctorName?: string;
  doctorQualification?: string;
  doctorRegNo?: string;
  clinicName?: string;
  consultationId?: string;
  signatureUri?: string; // data/URI of a signature image (optional)
  // Optional pre-derived blocks rendered above the detailed sections.
  soap?: { subjective: string; objective: string; assessment: string; plan: string };
  previousSummary?: {
    date?: string;
    diagnosis: string[];
    medicines: string[];
    symptoms: string[];
    investigations: string[];
    followUp: string[];
  };
  // Visit-over-visit diff against the patient's previous consultation, printed
  // as the "Since Last Visit" panel. Built by buildVisitComparison(); omitted
  // (and the panel dropped) when there is no earlier visit to compare against.
  comparison?: VisitComparison & { previousDate?: string };
}

/**
 * Consultation date/time for the Patient Information block.
 *
 * `createdAt` is an ISO timestamp and the only field carrying a time, so it is
 * preferred. `date` is a locale-formatted string written by the client at
 * creation ("6/24/2026") and is the fallback for older records that predate
 * `createdAt`. Both return undefined rather than a placeholder when nothing
 * usable exists, so the row is dropped.
 */
export function formatConsultDate(c?: { date?: string; createdAt?: string }): string | undefined {
  const d = c?.createdAt ? new Date(c.createdAt) : null;
  if (d && !Number.isNaN(d.getTime())) {
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  }
  return c?.date?.trim() || undefined;
}

export function formatConsultTime(c?: { createdAt?: string }): string | undefined {
  if (!c?.createdAt) return undefined; // legacy rows have no time to report
  const d = new Date(c.createdAt);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Ink for the printed clinical document.
 *
 * Exported because the on-screen report preview renders the SAME document and
 * has to draw it in the same colours — React Native needs literal hex, so the
 * two surfaces read them from here rather than each keeping its own copy.
 */
export const DOC_COLORS = {
  ink: '#111827', // headings
  text: '#1F2937', // body copy
  muted: '#6B7280', // labels, secondary meta
  faint: '#9CA3AF',
  line: '#E5E7EB', // card / table borders
  hairline: '#F1F3F7', // row separators
  soft: '#F8FAFC', // strip + table-header fill
  accent: '#0D9488', // section headings
  rx: '#7C3AED', // the prescription heading, the one thing that must stand out
  good: '#15803D',
  goodSoft: '#ECFDF3',
  warn: '#B45309',
  warnSoft: '#FEF6E7',
  stop: '#BE123C',
  stopSoft: '#FFF1F3',
} as const;

/**
 * Letterhead: clinic and doctor on the left, consultation date/time right —
 * the top of a printed prescription, not a boxed data grid.
 */
function letterheadHtml(meta: ReportMeta): string {
  const clinic = escapeHtml(meta.clinicName || 'NovaScribe Clinic');
  const docLine = [
    meta.doctorName || L('Attending Physician'),
    meta.doctorQualification,
    meta.doctorRegNo ? `Reg. ${meta.doctorRegNo}` : '',
  ].map((x) => escapeHtml(x || '')).filter(Boolean).join(' · ');
  const date = escapeHtml(meta.consultationDate || meta.dateTime || meta.date || '');
  const time = escapeHtml(meta.consultationTime || '');
  return `<table class="lh"><tr>
    <td class="lh-l">
      <div class="lh-clinic">${clinic}</div>
      ${docLine ? `<div class="lh-doc">${docLine}</div>` : ''}
    </td>
    <td class="lh-r">
      ${date ? `<div class="lh-date">${date}</div>` : ''}
      ${time ? `<div class="lh-time">OPD · ${time}</div>` : ''}
    </td>
  </tr></table>`;
}

/**
 * Patient identity strip — one tinted band under the letterhead carrying who
 * this document is about, the way a prescription reads.
 *
 * A table, not flex: this HTML is rendered by the platform print engines behind
 * expo-print (WebKit on iOS, Android's print framework), and a table is what
 * reliably survives their layout and pagination.
 *
 * Every field is optional and simply drops out when absent — a clinical
 * document must not print "N/A" against a patient's phone number, because a
 * reader cannot tell "we never asked" from "the patient has no phone".
 */
function patientStripHtml(meta: ReportMeta): string {
  const cell = (label: string, value?: string | number): string => {
    const v = value === undefined || value === null ? '' : String(value).trim();
    return v
      ? `<td class="ps-c"><span class="ps-k">${escapeHtml(L(label))}:</span> <span class="ps-v">${escapeHtml(v)}</span></td>`
      : '';
  };

  const age = meta.patientAge ? String(meta.patientAge).trim() : '';
  const sex = (meta.patientGender || '').trim();
  const ageSexLabel = age && sex ? 'Age / Sex' : age ? 'Age' : 'Sex';

  const cells = [
    cell('Patient', meta.patientName),
    cell(ageSexLabel, [age, sex].filter(Boolean).join(' / ')),
    cell('Phone', meta.patientPhone),
  ].filter(Boolean).join('');

  // Identifiers and the transcription language sit on a quieter second line:
  // they matter for the record, not for reading the prescription.
  const sub = [
    meta.patientId ? `${L('Patient ID')}: ${meta.patientId}` : '',
    meta.transcriptionLanguage ? `${L('Language')}: ${meta.transcriptionLanguage}` : '',
  ].filter(Boolean).map(escapeHtml).join(' · ');

  if (!cells && !sub) return '';

  return `<div class="ps">
    ${cells ? `<table class="ps-t"><tr>${cells}</tr></table>` : ''}
    ${sub ? `<div class="ps-sub">${sub}</div>` : ''}
  </div>`;
}

// ── "Since Last Visit" comparison panel ──────────────────────
type CmpTone = 'new' | 'good' | 'stop' | 'mut';

/** Progress badge → tone. Mirrors the on-screen compare panel. */
export function progressTone(label: string): CmpTone {
  return label === 'Improving' ? 'good' : label === 'Needs attention' ? 'stop' : label === 'Mixed' ? 'new' : 'mut';
}

/** Direction glyph for a vital that moved between the two visits. */
export const trendGlyph = (d: 'up' | 'down' | 'same' | null): string =>
  d === 'up' ? '▲' : d === 'down' ? '▼' : '→';

/**
 * What changed since the patient's previous consultation, printed as a compact
 * panel directly under the patient strip.
 *
 * Purely derived from two already-stored reports (see buildVisitComparison), so
 * every past consultation gains it without new data. Returns '' when there is
 * no previous visit or nothing comparable — the panel is then absent from the
 * document rather than printed empty.
 */
function comparisonHtml(meta: ReportMeta): string {
  const c = meta.comparison;
  if (!c || !c.hasAny) return '';

  const tags = (items: string[], tone: CmpTone) =>
    items.map((i) => `<span class="tag tag-${tone}">${escapeHtml(i)}</span>`).join('');

  const group = (label: string, items: string[], tone: CmpTone) =>
    items.length ? `<div class="cg"><span class="cg-l">${escapeHtml(L(label))}</span>${tags(items, tone)}</div>` : '';

  const row = (label: string, inner: string) =>
    inner ? `<tr><th>${escapeHtml(L(label))}</th><td>${inner}</td></tr>` : '';

  const vitals = c.vitals.length
    ? `<div class="vtrend">${c.vitals
        .map(
          (v) =>
            `<div class="vt"><span class="vt-k">${escapeHtml(L(v.label))}</span>` +
            `<span class="vt-p">${escapeHtml(v.previous)}</span>` +
            `<span class="vt-a vt-${v.direction || 'same'}">${trendGlyph(v.direction)}</span>` +
            `<span class="vt-c">${escapeHtml(v.current)}</span></div>`,
        )
        .join('')}</div>`
    : '';

  const body = [
    row(
      'Symptoms',
      [
        group('New', c.symptoms.added, 'new'),
        group('Resolved', c.symptoms.resolved, 'good'),
        group('Continuing', c.symptoms.continuing, 'mut'),
      ].join(''),
    ),
    row('Vitals', vitals),
    row(
      'Medicines',
      [
        group('Started', c.medicines.started, 'new'),
        group('Stopped', c.medicines.stopped, 'stop'),
        group('Continued', c.medicines.continued, 'mut'),
      ].join(''),
    ),
    row(
      'Tests',
      [
        group('New', c.tests.added, 'new'),
        group('No longer noted', c.tests.removed, 'mut'),
        group('Continuing', c.tests.continuing, 'mut'),
      ].join(''),
    ),
  ].join('');

  if (!body) return '';

  const badge = c.progress
    ? `<span class="pill pill-${progressTone(c.progress.label)}">${escapeHtml(L(c.progress.label))}</span>`
    : '';

  return `<section class="cmp">
    <div class="cmp-top">
      <span class="cmp-h">${escapeHtml(L('Since Last Visit'))}</span>
      ${c.previousDate ? `<span class="cmp-date">${escapeHtml(L('vs'))} ${escapeHtml(c.previousDate)}</span>` : ''}
      ${badge}
    </div>
    ${c.progress ? `<div class="cmp-sum">${escapeHtml(c.progress.summary)}</div>` : ''}
    <table class="kv cmp-kv">${body}</table>
  </section>`;
}

function prevSummaryHtml(meta: ReportMeta): string {
  const p = meta.previousSummary;
  if (!p) return '';
  // Same blank rule as the main report: a previous-visit line reading "Nil"
  // carries no information, so the row is dropped rather than printed.
  const row = (label: string, items: string[]) => {
    const live = nonEmptyItems(items);
    return live.length
      ? `<tr><th>${escapeHtml(L(label))}</th><td>${live.map(escapeHtml).join('; ')}</td></tr>`
      : '';
  };
  const rows = [
    row('Previous Symptoms', p.symptoms),
    row('Previous Diagnosis', p.diagnosis),
    row('Previous Medicines', p.medicines),
    row('Previous Investigations', p.investigations),
    row('Previous Follow-up', p.followUp),
  ].join('');
  if (!rows) return '';
  return `<section class="prev">
    <h2>${escapeHtml(L('Previous Consultation Summary'))}${p.date ? ` - ${escapeHtml(p.date)}` : ''}</h2>
    <table class="kv">${rows}</table>
  </section>`;
}

function soapHtml(meta: ReportMeta): string {
  const s = meta.soap;
  if (!s) return '';
  const block = (label: string, letter: string, text: string) =>
    hasValue(text)
      ? `<div class="soap-row"><div class="soap-tag">${letter}</div><div class="soap-body"><div class="soap-label">${escapeHtml(L(label))}</div><div class="soap-text">${escapeHtml(text).replace(/\n/g, '<br/>')}</div></div></div>`
      : '';
  const body = [
    block('Subjective', 'S', s.subjective),
    block('Objective', 'O', s.objective),
    block('Assessment', 'A', s.assessment),
    block('Plan', 'P', s.plan),
  ].join('');
  if (!body) return '';
  return `<section class="soap-section"><h2>${escapeHtml(L('SOAP Summary'))}</h2>${body}</section>`;
}

/** Value for one cell, falling back to the deprecated `dosage` alias for dose. */
const cellValue = (r: Record<string, any>, c: ColumnDef): string => {
  const raw = str(r[c.key]) || (c.key === 'dose' ? str((r as any).dosage) : '');
  return isBlank(raw) ? '' : raw.trim();
};

/**
 * Render a clinical table with nothing empty in it.
 *
 * Two passes of filtering, because a table can be sparse in both directions:
 *   • rows   — blank rows come from the editor seeding a line to type into
 *   • columns — a column nobody filled (Compliance, Purpose, Route…) otherwise
 *     prints as a header with an empty cell in every row, eating width and
 *     forcing the remaining columns to wrap. Dropping it keeps the table narrow
 *     and readable, which is most of what makes the PDF compact.
 *
 * Returns '' when nothing survives, so the caller omits the section entirely.
 */
function tableHtml(columns: ColumnDef[], rows: Record<string, any>[]): string {
  const liveRows = nonEmptyRows(rows);
  if (!liveRows.length) return '';

  const liveCols = columns.filter(c => liveRows.some(r => cellValue(r, c) !== ''));
  if (!liveCols.length) return '';

  const head = liveCols.map(c => `<th>${escapeHtml(L(c.label))}</th>`).join('');
  const body = liveRows
    .map(r => `<tr>${liveCols.map(c => `<td>${escapeHtml(cellValue(r, c))}</td>`).join('')}</tr>`)
    .join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function sectionBodyHtml(report: ReportData, s: ReportSectionDef): string {
  const v = report[s.key];
  switch (s.kind) {
    case 'overview':
      return `<p class="overview">${escapeHtml(str(v)).replace(/\n/g, '<br/>')}</p>`;
    case 'bullets':
      return `<ul>${nonEmptyItems(v as string[]).map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`;
    case 'complaints':
      return tableHtml(COMPLAINT_COLUMNS, v as ComplaintRow[]);
    case 'allergies':
      return tableHtml(ALLERGY_COLUMNS, v as AllergyRow[]);
    case 'medications':
      return tableHtml(s.columns || TREATMENT_COLUMNS, v as MedicationRow[]);
    case 'groups':
      // Only groups with real findings. A named group with an empty list would
      // print a sub-heading followed by nothing.
      return (v as SystemGroup[])
        .map(g => ({ name: g.name, findings: nonEmptyItems(g.findings) }))
        .filter(g => g.findings.length > 0)
        .map(
          g =>
            `<div class="group">${hasValue(g.name) ? `<div class="group-name">${escapeHtml(g.name.trim())}</div>` : ''}` +
            `<ul>${g.findings.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul></div>`,
        )
        .join('');
    case 'vitals': {
      // Measurement cards rather than a key/value table: four to a line, each
      // reading label-over-value, which is how a doctor scans vitals.
      const vitals = v as Vitals;
      const cards = VITALS_FIELDS.filter(f => hasValue(vitals[f.key]))
        .map(
          f =>
            `<div class="vital"><div class="vk">${escapeHtml(vitalHeading(f))}</div>` +
            `<div class="vv">${escapeHtml(str(vitals[f.key]).trim())}</div></div>`,
        )
        .join('');
      return cards ? `<div class="vitals">${cards}</div>` : '';
    }
    case 'followup': {
      const fu = v as FollowUp;
      const rows = FOLLOWUP_FIELDS.filter(f => hasValue(fu[f.key]))
        .map(f => `<tr><th>${escapeHtml(L(f.label))}</th><td>${escapeHtml(str(fu[f.key]).trim())}</td></tr>`)
        .join('');
      return rows ? `<table class="kv">${rows}</table>` : '';
    }
    default:
      return '';
  }
}

// ─────────────────────────────────────────────────────────────
// Redundancy removal (presentation layer)
// ─────────────────────────────────────────────────────────────
//
// Generated reports restate the same facts in several places: the overview
// paragraph typically repeats the complaints, the history, the vitals and the
// advice, and the review of systems echoes symptoms already listed under Chief
// Complaints. Printed verbatim that runs to several pages saying one page of
// clinical fact.
//
// condenseReport() returns a NEW report with the redundancy removed. The stored
// document is never mutated — this is a rendering concern, so nothing is lost
// and the behaviour can be reverted by simply not calling it. Preview, print and
// PDF all call it, which is what keeps the three surfaces identical.

/** Words that carry no distinguishing clinical meaning when comparing text. */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'to', 'in', 'on', 'at', 'for', 'and', 'or', 'is', 'are',
  'was', 'were', 'be', 'been', 'has', 'have', 'had', 'with', 'that', 'this', 'it',
  'as', 'by', 'from', 'patient', 'patients', 'pt', 'reports', 'reported', 'presents',
  'presenting', 'complains', 'complaining', 'states', 'noted', 'also', 'there',
  'his', 'her', 'their', 'he', 'she', 'they', 'about', 'since', 'past', 'ago',
  // Purely rhetorical qualifiers. These carry no clinical content, but each one
  // is an unmatched token that pushes a short phrase under the duplicate
  // threshold — "Burning in chest (especially at night)" scored 0.75 against a
  // complaint recorded as "Burning in chest / at night" solely because of
  // "especially". Frequency and severity words (mild, occasional, severe…) are
  // deliberately NOT here: those change what is being asserted.
  'especially', 'particularly', 'mainly', 'mostly', 'generally', 'overall',
]);

// Negation and qualifier words are deliberately NOT stopwords: "no fever" and
// "fever" must never compare as the same clinical statement.
const KEEP_ALWAYS = new Set(['no', 'not', 'denies', 'without', 'negative', 'absent']);

/** Content tokens of a phrase, for comparing what two pieces of text assert. */
function tokens(text: string): Set<string> {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 || KEEP_ALWAYS.has(w))
      .filter((w) => KEEP_ALWAYS.has(w) || !STOPWORDS.has(w)),
  );
}

/** Canonical form of a short phrase, for exact-duplicate detection. */
function canonical(text: string): string {
  return [...tokens(text)].sort().join(' ');
}

/**
 * How much of `candidate` is already asserted by `known`.
 *
 * Asymmetric on purpose: a short sentence fully contained in a longer body is
 * redundant, but a long sentence sharing a few words with a short one is not.
 */
function coveredBy(candidate: string, known: Set<string>): number {
  const t = [...tokens(candidate)];
  if (!t.length) return 0;
  return t.filter((w) => known.has(w)).length / t.length;
}

/** Split a paragraph into sentences, keeping clinically meaningful ones. */
function sentences(text: string): string[] {
  return String(text || '')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

/** Remove entries that repeat one another within a single list. */
function dedupeList(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const key = canonical(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(raw.trim());
  }
  return out;
}

/**
 * Remove duplicate medicines from one list.
 *
 * Keyed on the drug name alone, so "Paracetamol 500mg" and "Paracetamol 650mg"
 * are treated as the SAME entry — a dose change is an amendment, not a second
 * drug, and printing both reads as a double prescription. The first occurrence
 * wins, and any field the later row filled in but the first left blank is
 * merged in, so no detail is lost.
 */
function dedupeMedications<T extends Record<string, any>>(rows: T[]): T[] {
  const byName = new Map<string, T>();
  const order: string[] = [];
  for (const row of rows) {
    const name = canonical(String(row?.medicine ?? ''));
    if (!name) continue;
    const existing = byName.get(name);
    if (!existing) {
      byName.set(name, { ...row });
      order.push(name);
      continue;
    }
    for (const [k, v] of Object.entries(row)) {
      if (isBlank((existing as any)[k]) && hasValue(v)) (existing as any)[k] = v;
    }
  }
  return order.map((n) => byName.get(n)!);
}

/** Every clinical statement the detailed sections already make. */
function claimedTokens(r: ReportData): Set<string> {
  const vitals = r.clinicalMeasurements || ({} as Vitals);
  const parts: string[] = [
    ...(r.chiefComplaints || []).map((c) => [c.complaint, c.duration, c.severity].join(' ')),
    ...nonEmptyItems(r.historyOfPresentIllness),
    ...nonEmptyItems(r.assessment),
    ...nonEmptyItems(r.advice),
    ...(r.physicalExamination || []).flatMap((g) => [g.name, ...(g.findings || [])]),
    ...(r.prescribedMedications || []).map((m: any) => [m?.medicine, m?.purpose].join(' ')),
    ...nonEmptyItems(r.pastMedicalHistory),
    ...(r.allergies || []).map((a) => [a.allergy, a.reaction].join(' ')),
    // Vitals must contribute their LABELS as well as their values. Values alone
    // are bare numbers, so a summary sentence like "blood pressure of 122/80 and
    // pulse of 78" matched only "122", "80", "78" — a third of its words — and
    // survived as "new", even though it restates the vitals table exactly.
    ...VITALS_FIELDS.filter((f) => hasValue(vitals[f.key])).map(
      (f) => `${f.label} ${str(vitals[f.key])}`,
    ),
    // Same for the follow-up block.
    ...FOLLOWUP_FIELDS.filter((f) => hasValue((r.followUp || ({} as FollowUp))[f.key])).map(
      (f) => `${f.label} ${str((r.followUp || ({} as FollowUp))[f.key])}`,
    ),
  ];
  const all = new Set<string>();
  for (const p of parts) for (const t of tokens(p)) all.add(t);
  // "Vital signs are stable" style phrasing shares no words with a numeric
  // table, so the vocabulary of restatement is treated as already-claimed too.
  for (const w of ['vital', 'vitals', 'sign', 'signs', 'stable', 'normal', 'within', 'limits']) all.add(w);
  return all;
}

/** Maximum sentences kept in the executive summary. */
const OVERVIEW_MAX_SENTENCES = 3;
/** A sentence this well covered by other sections adds nothing new. */
const DUPLICATE_THRESHOLD = 0.8;

/**
 * Condense a report for display: drop what is said twice, keep what is said once.
 *
 * Returns a new object; the input is not mutated.
 */
export function condenseReport(report: ReportData): ReportData {
  const r = report;
  const claimed = claimedTokens(r);

  // ── Clinical Overview → executive summary ──
  // Every sentence that merely restates the detailed sections is dropped, and
  // what survives is capped at three. A summary that ends up empty is hidden
  // rather than padded — the detailed sections already carry the facts.
  const overview = sentences(r.clinicalOverview)
    .filter((s) => coveredBy(s, claimed) < DUPLICATE_THRESHOLD)
    .slice(0, OVERVIEW_MAX_SENTENCES)
    .join(' ');

  // ── Review of Systems → only what is documented nowhere else ──
  //
  // Compared against the examination and vitals as well as the complaints and
  // history: left to itself the generator reproduces the whole history by body
  // system, and has been observed emitting a "Cardiovascular" system whose sole
  // findings were the blood pressure and pulse from the vitals table.
  const documented = new Set<string>();
  // Duration and severity count as documented too: a complaint recorded as
  // "Burning in chest / at night" is not made new by an ROS line reading
  // "Burning in chest (especially at night)".
  for (const c of r.chiefComplaints || [])
    for (const t of tokens([c.complaint, c.duration, c.severity].join(' '))) documented.add(t);
  for (const h of nonEmptyItems(r.historyOfPresentIllness)) for (const t of tokens(h)) documented.add(t);
  for (const g of r.physicalExamination || [])
    for (const f of nonEmptyItems(g.findings)) for (const t of tokens(f)) documented.add(t);
  for (const f of VITALS_FIELDS)
    if (hasValue((r.clinicalMeasurements || ({} as Vitals))[f.key]))
      for (const t of tokens(`${f.label} ${str((r.clinicalMeasurements as Vitals)[f.key])}`)) documented.add(t);

  const reviewOfSystems = (r.reviewOfSystems || [])
    .map((g) => ({
      name: g.name,
      findings: dedupeList(nonEmptyItems(g.findings)).filter(
        (f) => coveredBy(f, documented) < DUPLICATE_THRESHOLD,
      ),
    }))
    .filter((g) => g.findings.length > 0);

  // Physical examination: real findings only, deduplicated within each group.
  const physicalExamination = (r.physicalExamination || [])
    .map((g) => ({ name: g.name, findings: dedupeList(nonEmptyItems(g.findings)) }))
    .filter((g) => g.findings.length > 0);

  return {
    ...r,
    clinicalOverview: overview,
    reviewOfSystems,
    physicalExamination,
    // Bullet lists: repeated advice/history lines collapse to one.
    historyOfPresentIllness: dedupeList(nonEmptyItems(r.historyOfPresentIllness)),
    pastMedicalHistory: dedupeList(nonEmptyItems(r.pastMedicalHistory)),
    surgicalHistory: dedupeList(nonEmptyItems(r.surgicalHistory)),
    familyHistory: dedupeList(nonEmptyItems(r.familyHistory)),
    socialHistory: dedupeList(nonEmptyItems(r.socialHistory)),
    assessment: dedupeList(nonEmptyItems(r.assessment)),
    advice: dedupeList(nonEmptyItems(r.advice)),
    redFlags: dedupeList(nonEmptyItems(r.redFlags)),
    ordersDiagnostics: (r.ordersDiagnostics || [])
      .map((g) => ({ name: g.name, findings: dedupeList(nonEmptyItems(g.findings)) }))
      .filter((g) => g.findings.length > 0),
    // Medicines: one row per drug. History and prescription stay separate
    // sections because "already taking" and "newly prescribed" are different
    // clinical statements, but neither lists the same drug twice.
    medicationHistory: dedupeMedications(nonEmptyRows(r.medicationHistory as any[])),
    prescribedMedications: dedupeMedications(nonEmptyRows(r.prescribedMedications as any[])),
    chiefComplaints: nonEmptyRows(r.chiefComplaints as any[]),
    allergies: nonEmptyRows(r.allergies as any[]),
  } as ReportData;
}

/** Build a clean, paginating A4 HTML document for the report (print / PDF export). */
export function buildReportHtml(rawReport: ReportData, meta: ReportMeta = {}): string {
  // Condense first: print/PDF and the on-screen preview all render the SAME
  // condensed object, which is what guarantees the three surfaces agree.
  const report = condenseReport(rawReport);
  // Render each candidate section, then keep only those that actually produced
  // markup. sectionHasContent() is the primary gate, but building first and
  // checking the result guarantees no heading is ever emitted above an empty
  // body — which is what would leave a stray title and white space in the PDF.
  //
  // Numbering is applied after filtering, so the printed sequence is always
  // 1, 2, 3… with no gaps where an omitted section used to sit.
  const sectionsHtml = REPORT_SECTIONS
    .filter(s => sectionHasContent(report, s))
    .map(s => ({ key: s.key, title: sectionHeading(s), body: sectionBodyHtml(report, s).trim() }))
    .filter(s => s.body.length > 0)
    // No numbering: sections are titled, not enumerated, so the document reads
    // as a prescription rather than a form.
    .map(s => `<section${s.key === 'prescribedMedications' ? ' class="rx"' : ''}>
        <h2>${escapeHtml(s.title)}</h2>
        ${s.body}
      </section>`)
    .join('');

  const signatureImg = meta.signatureUri
    ? `<img class="sig-img" src="${meta.signatureUri}" alt="Signature" />`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Clinical Report</title>
<style>
  /* A clinical prescription, not a form: a plain letterhead, one tinted patient
     strip, then titled sections separated by whitespace and hairlines. Colour is
     used only where it carries meaning — the section headings, the prescription,
     and the change tags in the comparison panel. */
  @page { size: A4; margin: 13mm 13mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: ${DOC_COLORS.text}; font-size: 12px; line-height: 1.55; background: #fff; margin: 0; }

  /* ── Letterhead ── */
  .lh { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  .lh td { border: none; padding: 0; vertical-align: top; }
  .lh-l { width: 65%; }
  .lh-r { text-align: right; white-space: nowrap; }
  .lh-clinic { font-size: 19px; font-weight: 800; color: ${DOC_COLORS.ink}; letter-spacing: -0.2px; }
  .lh-doc { font-size: 11px; color: ${DOC_COLORS.accent}; margin-top: 3px; }
  .lh-date { font-size: 11px; color: ${DOC_COLORS.muted}; }
  .lh-time { font-size: 11px; color: ${DOC_COLORS.muted}; margin-top: 2px; }

  /* ── Patient strip ── */
  .ps { background: ${DOC_COLORS.soft}; border-top: 1px solid ${DOC_COLORS.line}; border-bottom: 1px solid ${DOC_COLORS.line}; padding: 8px 12px; margin-bottom: 16px; page-break-inside: avoid; }
  .ps-t { width: 100%; border-collapse: collapse; }
  .ps-t td.ps-c { border: none; padding: 0 18px 0 0; font-size: 11.5px; vertical-align: top; }
  .ps-k { color: ${DOC_COLORS.muted}; }
  .ps-v { color: ${DOC_COLORS.ink}; font-weight: 700; }
  .ps-sub { margin-top: 4px; font-size: 9.5px; color: ${DOC_COLORS.faint}; word-break: break-word; }

  /* ── Sections ── */
  section { margin-bottom: 15px; page-break-inside: avoid; }
  h2 { font-size: 10px; font-weight: 700; color: ${DOC_COLORS.accent}; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.9px; }
  section.rx h2 { color: ${DOC_COLORS.rx}; }
  ul { margin: 0; padding-left: 17px; }
  li { padding: 1.5px 0; }
  .overview { margin: 0; }
  .group { margin-bottom: 7px; }
  .group-name { font-weight: 700; color: ${DOC_COLORS.ink}; font-size: 11px; margin-bottom: 2px; }

  /* ── Tables: hairline rows, no vertical rules ── */
  table { width: 100%; border-collapse: collapse; margin-top: 2px; }
  th, td { border: none; padding: 7px 10px; text-align: left; vertical-align: top; font-size: 11px; }
  thead th { background: ${DOC_COLORS.soft}; color: ${DOC_COLORS.muted}; font-weight: 600; border-top: 1px solid ${DOC_COLORS.line}; border-bottom: 1px solid ${DOC_COLORS.line}; }
  tbody td { border-bottom: 1px solid ${DOC_COLORS.hairline}; color: ${DOC_COLORS.text}; }
  tbody td:first-child { font-weight: 700; color: ${DOC_COLORS.ink}; }
  table.kv td:first-child { font-weight: 400; }
  table.kv th { width: 150px; white-space: nowrap; background: transparent; border: none; color: ${DOC_COLORS.muted}; font-weight: 600; padding-left: 0; }
  table.kv td { border: none; color: ${DOC_COLORS.text}; }

  /* ── Vitals cards ── */
  .vitals { margin-top: 2px; }
  .vital { display: inline-block; width: 23%; margin: 0 1.5% 6px 0; border: 1px solid ${DOC_COLORS.line}; border-radius: 8px; padding: 7px 10px; vertical-align: top; }
  .vk { font-size: 9px; color: ${DOC_COLORS.muted}; }
  .vv { font-size: 12.5px; font-weight: 700; color: ${DOC_COLORS.ink}; margin-top: 1px; }

  /* ── Since Last Visit ── */
  .cmp { border: 1px solid ${DOC_COLORS.line}; border-radius: 10px; padding: 10px 12px 6px; page-break-inside: avoid; }
  .cmp-top { margin-bottom: 4px; }
  .cmp-h { font-size: 10px; font-weight: 700; color: ${DOC_COLORS.accent}; text-transform: uppercase; letter-spacing: 0.9px; }
  .cmp-date { font-size: 9.5px; color: ${DOC_COLORS.faint}; margin-left: 6px; }
  .cmp-sum { font-size: 11px; color: ${DOC_COLORS.muted}; margin-bottom: 4px; }
  .cmp-kv th { width: 78px; padding: 6px 10px 6px 0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; }
  .cmp-kv td { padding: 4px 0; }
  .cmp-kv tr + tr th, .cmp-kv tr + tr td { border-top: 1px solid ${DOC_COLORS.hairline}; }
  .cg { margin: 2px 0; }
  .cg-l { font-size: 9.5px; color: ${DOC_COLORS.faint}; margin-right: 5px; }
  .tag { display: inline-block; font-size: 10px; padding: 1px 7px; border-radius: 9px; margin: 0 4px 3px 0; }
  .tag-new { background: ${DOC_COLORS.warnSoft}; color: ${DOC_COLORS.warn}; }
  .tag-good { background: ${DOC_COLORS.goodSoft}; color: ${DOC_COLORS.good}; }
  .tag-stop { background: ${DOC_COLORS.stopSoft}; color: ${DOC_COLORS.stop}; }
  .tag-mut { background: ${DOC_COLORS.soft}; color: ${DOC_COLORS.muted}; border: 1px solid ${DOC_COLORS.line}; }
  .pill { display: inline-block; font-size: 9.5px; font-weight: 700; padding: 1px 8px; border-radius: 9px; margin-left: 6px; }
  .pill-good { background: ${DOC_COLORS.goodSoft}; color: ${DOC_COLORS.good}; }
  .pill-new { background: ${DOC_COLORS.warnSoft}; color: ${DOC_COLORS.warn}; }
  .pill-stop { background: ${DOC_COLORS.stopSoft}; color: ${DOC_COLORS.stop}; }
  .pill-mut { background: ${DOC_COLORS.soft}; color: ${DOC_COLORS.muted}; }
  .vt { font-size: 11px; margin: 2px 0; }
  .vt-k { color: ${DOC_COLORS.muted}; margin-right: 7px; }
  .vt-p { color: ${DOC_COLORS.faint}; }
  /* Deliberately one neutral colour for every direction. Whether a vital rising
     is good or bad depends on the vital — SpO₂ up is reassuring, blood pressure
     up is not — so the document states the direction and leaves the reading to
     the doctor rather than colouring a judgement it cannot make. */
  .vt-a { margin: 0 5px; font-size: 9px; color: ${DOC_COLORS.faint}; }
  .vt-c { color: ${DOC_COLORS.ink}; font-weight: 700; }

  /* ── Previous-visit summary (only when supplied) ── */
  .prev { border: 1px solid ${DOC_COLORS.line}; border-left: 3px solid ${DOC_COLORS.warn}; border-radius: 10px; padding: 9px 12px; }
  .prev h2 { color: ${DOC_COLORS.warn}; }

  /* ── SOAP ── */
  .soap-row { margin-bottom: 7px; page-break-inside: avoid; }
  .soap-tag { display: inline-block; width: 18px; height: 18px; border-radius: 5px; background: ${DOC_COLORS.accent}; color: #fff; font-weight: 700; font-size: 10px; text-align: center; line-height: 18px; margin-right: 7px; vertical-align: top; }
  .soap-body { display: inline-block; width: calc(100% - 28px); vertical-align: top; }
  .soap-label { font-weight: 700; color: ${DOC_COLORS.muted}; font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; }
  .soap-text { white-space: normal; }

  /* ── Signature / footer ── */
  .signature { margin-top: 26px; page-break-inside: avoid; text-align: right; }
  .signature .box { display: inline-block; width: 230px; text-align: center; font-size: 10.5px; color: ${DOC_COLORS.muted}; }
  .sig-img { max-height: 52px; max-width: 190px; object-fit: contain; margin-bottom: 2px; }
  .signature .line { border-top: 1px solid ${DOC_COLORS.line}; padding-top: 5px; }
  .signature .name { font-weight: 700; color: ${DOC_COLORS.ink}; }
  .footer { margin-top: 16px; text-align: center; color: ${DOC_COLORS.faint}; font-size: 9px; border-top: 1px solid ${DOC_COLORS.line}; padding-top: 7px; }
</style>
</head>
<body>
  ${letterheadHtml(meta)}
  ${patientStripHtml(meta)}
  ${comparisonHtml(meta)}
  ${prevSummaryHtml(meta)}
  ${soapHtml(meta)}
  ${sectionsHtml}
  <div class="signature">
    <div class="box">
      ${signatureImg}
      <div class="line">
        <div class="name">${escapeHtml(meta.doctorName || L('Attending Physician'))}</div>
        ${meta.doctorQualification ? `<div>${escapeHtml(meta.doctorQualification)}</div>` : ''}
        <div>${escapeHtml(L("Doctor's Signature"))}</div>
      </div>
    </div>
  </div>
  <div class="footer">
    ${escapeHtml(L('Generated by NovaScribe • This is a computer-generated clinical document.'))}
    ${meta.consultationId ? `<br/>${escapeHtml(L('Consultation ID'))}: ${escapeHtml(meta.consultationId)}` : ''}
  </div>
</body>
</html>`;
}
