export interface Patient {
  id: string;
  name: string;
  age: number;
  gender: string;
  phone?: string;
}

export interface TranscriptLine {
  // Real speaker diarization is not implemented yet, so transcript lines use
  // 'Unknown Speaker'. 'Doctor'/'Patient'/'System' remain for legacy/mock data.
  speaker: 'Doctor' | 'Patient' | 'System' | 'Unknown Speaker';
  text: string;
  timestamp: string;
}

// One automatic medical-terminology correction, as returned by the backend
// engine and persisted with the consultation. Defined here rather than in the
// API layer so the wire shape and the stored shape cannot drift apart.
export interface TerminologyCorrection {
  original: string;
  corrected: string;
  category: string;
  score: number;
  confidence: 'high' | 'medium' | 'low';
  method: 'exact' | 'prefix' | 'metaphone' | 'soundex' | 'fuzzy';
  // Why this token was considered a medical term at all (clinical cue word,
  // low STT confidence, …). Kept so a surprising correction can be explained.
  candidateReason: string;
  // Token offset in the transcript the correction was applied at.
  index: number;
}

export interface Consultation {
  id: string;
  patientId: string;
  patientName: string;
  date: string;
  status: 'Draft' | 'Recording' | 'Processing' | 'Completed';
  transcript: TranscriptLine[];
  report?: ReportData;
  // URL of an uploaded audio file attached to this session (empty/undefined for
  // live recordings). Persisted so it survives a page refresh.
  audioUrl?: string;
  // Session lifecycle timestamps (ISO). `id` doubles as the session id.
  createdAt?: string;
  updatedAt?: string;
  // Mobile-persisted extras (the backend stores arbitrary fields). Plain-text
  // transcript, the raw spoken-language transcript, and recording length.
  transcriptText?: string;
  originalTranscript?: string;
  durationSec?: number;
  // Language code the transcription ran in ('auto' | 'en' | 'hi' | …). Stored
  // so the exported report can state it long after the session, when the
  // capture screen's local state is gone.
  language?: string;
  // Transcript exactly as the speech model produced it, before the clinical
  // terminology engine normalised drug and condition names. `transcriptText`
  // holds the corrected version that the report is built from; this is kept so
  // every automatic correction remains auditable.
  //
  // Distinct from `originalTranscript` above, which is the pre-TRANSLATION text.
  // A consultation can pass through both stages, and each keeps its own source.
  uncorrectedTranscript?: string;
  // What the terminology engine changed, for audit and debugging.
  terminologyCorrections?: TerminologyCorrection[];
  // When the doctor marked this consultation's follow-up as done. Absent means
  // the follow-up is still outstanding, which is what the dashboard counts.
  // Stored on the consultation rather than in a new collection so the existing
  // save endpoint persists it — the backend keeps arbitrary fields.
  followUpCompletedAt?: string;
  // Report edit history. Every save of an edited report appends a version so the
  // doctor can review or restore any earlier draft. Newest is also the live
  // `report`. Persisted with the consultation (backend stores arbitrary fields).
  reportVersions?: ReportVersion[];
}

// One immutable snapshot of a report at save time (report versioning).
export interface ReportVersion {
  version: number; // 1-based, increments per saved edit
  report: ReportData;
  savedAt: string; // ISO timestamp
  label?: string; // e.g. "AI generated", "Doctor edit", "Restored v2"
}

// A single medication row. The Premium Clinical Report uses a richer set of
// columns; different sections (Medication History vs. Treatment Plan) display
// different subsets of these fields. `dosage` is retained as an optional legacy
// alias so older saved prescriptions/reports still read correctly.
export interface MedicationRow {
  medicine: string;
  strength: string;
  dose: string;
  route: string;
  frequency: string;
  timing: string;
  duration: string;
  instructions: string;
  purpose: string;
  compliance: string;
  /** @deprecated legacy field — migrated into `dose`. */
  dosage?: string;
}

// Chief complaint with its duration / severity (Premium report table row).
export interface ComplaintRow {
  complaint: string;
  duration: string;
  severity: string;
}

// Allergy entry (Premium report table row).
export interface AllergyRow {
  allergy: string;
  reaction: string;
  severity: string;
}

// A grouped findings block — used for Review of Systems, Physical Examination
// and Orders & Diagnostic Plan, where each named group holds its own findings.
export interface SystemGroup {
  name: string;
  findings: string[];
}

// Editable clinical measurements / vitals (key-value).
export interface Vitals {
  bloodPressure: string;
  pulse: string;
  temperature: string;
  spo2: string;
  bloodSugar: string;
  height: string;
  weight: string;
  bmi: string;
  painScore: string;
  other: string;
}

// Editable follow-up plan.
export interface FollowUp {
  date: string;
  duration: string;
  reports: string;
  instructions: string;
}

// Persisted records for the dedicated data collections.
export interface ReportRecord {
  id: string;
  patientId: string;
  patientName: string;
  date: string;
  report: ReportData;
  createdAt?: string;
}

export interface PrescriptionRecord {
  id: string;
  patientId: string;
  patientName: string;
  date: string;
  prescribedMedications: MedicationRow[];
  advice: string[];
  createdAt?: string;
}

export interface TranscriptRecord {
  id: string;
  patientId: string;
  patientName: string;
  date: string;
  transcriptText: string;
  transcript: TranscriptLine[];
  createdAt?: string;
}

// Premium AI Clinical Report structure. Sections expand/shrink with the
// consultation: empty sections are simply omitted at render/print time. Field
// keys are intentionally stable so the rest of the app (dashboard, search,
// prescriptions) keeps working — `chiefComplaint`, `prescribedMedications`,
// `advice` and `notes` are preserved as the underlying keys.
export interface ReportData {
  // 1 — Patient Clinical Overview (AI physician summary). Read-only.
  clinicalOverview: string;
  // 2 — Chief Complaints. Read-only.
  chiefComplaints: ComplaintRow[];
  // 3 — History of Present Illness. Read-only.
  historyOfPresentIllness: string[];
  // 4 — Past Medical History. Read-only.
  pastMedicalHistory: string[];
  // 5 — Surgical / Procedure History. Read-only.
  surgicalHistory: string[];
  // 6 — Medication History (current medications). Editable.
  medicationHistory: MedicationRow[];
  // 7 — Allergy Profile. Read-only.
  allergies: AllergyRow[];
  // 8 — Family History. Read-only.
  familyHistory: string[];
  // 9 — Social & Lifestyle History. Read-only.
  socialHistory: string[];
  // 10 — Review of Systems (grouped). Read-only.
  reviewOfSystems: SystemGroup[];
  // 11 — Clinical Measurements / Vitals. Editable.
  clinicalMeasurements: Vitals;
  // 12 — Physical Examination Findings (grouped). Read-only.
  physicalExamination: SystemGroup[];
  // 13 — Clinical Impression / Assessment. Read-only.
  assessment: string[];
  // 14 — Treatment & Medication Plan (prescribed medicines). Editable.
  prescribedMedications: MedicationRow[];
  // 15 — Orders & Diagnostic Plan (grouped lab/imaging/cardiac/other). Read-only.
  ordersDiagnostics: SystemGroup[];
  // 16 — Care Plan & Patient Instructions. Editable. (Stored as `advice`.)
  advice: string[];
  // 17 — Warning Signs / Red Flags. Read-only.
  redFlags: string[];
  // 18 — Follow-up Plan. Editable.
  followUp: FollowUp;

  // Free-text notes (kept for backward-compatible search; not a rendered section).
  notes: string;
  // Compatibility projection of `chiefComplaints` as plain strings. Derived by
  // normalizeReport so existing dashboard/patient views keep working unchanged.
  chiefComplaint: string[];
}

