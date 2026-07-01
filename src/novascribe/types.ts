export interface Patient {
  id: string;
  name: string;
  age: number;
  gender: string;
  phone?: string;
}

// An upcoming ClinicBook appointment surfaced in NovaScribe so the doctor can
// start a scribe for that visit. `patientId` is the SHARED core patient id.
export interface UpcomingAppointment {
  appointmentId: string;
  patientId: string;
  patientName: string;
  doctorName?: string | null;
  speciality?: string | null;
  date: string; // YYYY-MM-DD
  time: string; // e.g. "6:00 PM"
  status: string;
}

export interface TranscriptLine {
  // Real speaker diarization is not implemented yet, so transcript lines use
  // 'Unknown Speaker'. 'Doctor'/'Patient'/'System' remain for legacy/mock data.
  speaker: 'Doctor' | 'Patient' | 'System' | 'Unknown Speaker';
  text: string;
  timestamp: string;
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
  // Links the record to its consultation; equals `id`. Optional for back-compat
  // with records saved before this field existed.
  consultationId?: string;
  patientId: string;
  patientName: string;
  date: string;
  report: ReportData;
  createdAt?: string;
}

export interface PrescriptionRecord {
  id: string;
  consultationId?: string;
  patientId: string;
  patientName: string;
  date: string;
  prescribedMedications: MedicationRow[];
  advice: string[];
  createdAt?: string;
}

export interface TranscriptRecord {
  id: string;
  consultationId?: string;
  patientId: string;
  patientName: string;
  date: string;
  transcriptText: string;
  transcript: TranscriptLine[];
  createdAt?: string;
}

// One entry returned by GET /api/patients/:patientId/history — a single past
// consultation with its linked report/transcript data already grouped together.
export interface HistoryMedicine {
  medicine: string;
  strength: string;
  dose: string;
  frequency: string;
  duration: string;
  instructions: string;
}

export interface ConsultationHistoryItem {
  consultationId: string;
  visitDateTime: string;
  chiefComplaints: string[];
  diagnosis: string[];
  medicines: HistoryMedicine[];
  reportStatus: 'Draft' | 'Completed';
  followUp: string;
  reportId: string | null;
  transcriptId: string | null;
  hasReport: boolean;
  transcriptText: string;
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

