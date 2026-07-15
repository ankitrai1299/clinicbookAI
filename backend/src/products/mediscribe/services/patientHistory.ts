// Builds the "Previous Consultation History" response for a patient.
//
// This is read-only and additive: it does NOT create or duplicate any records.
// It reads from the existing collections (consultations, reports, prescriptions,
// transcripts) and groups them under a single consultation using the shared id.
//
// Linking model
// -------------
// Across NovaScribe, a report / prescription / transcript record is saved with
// the SAME `id` as its consultation (see ConsultationWorkspace handleSave). So
// `consultationId === reportId === prescriptionId === transcriptId === consultation.id`.
// Newer records also carry an explicit `consultationId`. We match on either, so
// both legacy and new data group correctly.

import {
  consultationsRepo,
  reportsRepo,
  prescriptionsRepo,
  transcriptsRepo,
} from '../repositories/index.js';

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
  // The doctor who attended this visit (empty for legacy records without it).
  doctorName: string;
  chiefComplaints: string[];
  diagnosis: string[];
  medicines: HistoryMedicine[];
  reportStatus: 'Draft' | 'Completed';
  followUp: string;
  reportId: string | null;
  transcriptId: string | null;
  // Extras so the frontend can show "View Report" / "View Transcript" without
  // any additional round-trips. Optional in the documented contract.
  hasReport: boolean;
  transcriptText: string;
}

const asString = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const cleanStrings = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(asString).filter(Boolean) : [];

// Chief complaints: prefer the flat `chiefComplaint` projection, otherwise map
// the structured `chiefComplaints` rows down to readable strings.
function extractChiefComplaints(report: any): string[] {
  const flat = cleanStrings(report?.chiefComplaint);
  if (flat.length) return flat;
  if (Array.isArray(report?.chiefComplaints)) {
    return report.chiefComplaints
      .map((c: any) =>
        typeof c === 'string'
          ? c.trim()
          : [c?.complaint, c?.duration, c?.severity].map(asString).filter(Boolean).join(' — '),
      )
      .filter(Boolean);
  }
  return [];
}

// Diagnosis / assessment is stored as a string[] under `assessment`.
const extractDiagnosis = (report: any): string[] => cleanStrings(report?.assessment);

// Prescribed medicines come from the report's treatment plan, falling back to
// the consultation's embedded `prescriptions` array.
function extractMedicines(report: any, consultation: any): HistoryMedicine[] {
  const rows = Array.isArray(report?.prescribedMedications)
    ? report.prescribedMedications
    : Array.isArray(consultation?.prescriptions)
      ? consultation.prescriptions
      : [];
  return rows
    .map((m: any) => ({
      medicine: asString(m?.medicine),
      strength: asString(m?.strength),
      // `dose` is the current field; `dosage` is the legacy alias.
      dose: asString(m?.dose) || asString(m?.dosage),
      frequency: asString(m?.frequency),
      duration: asString(m?.duration),
      instructions: asString(m?.instructions),
    }))
    .filter((m: HistoryMedicine) => Object.values(m).some(Boolean));
}

// Follow-up plan is a {date,duration,reports,instructions} object — flatten it
// into a single readable line. Tolerates legacy string/array shapes too.
function extractFollowUp(report: any): string {
  const fu = report?.followUp;
  if (!fu) return '';
  if (typeof fu === 'string') return fu.trim();
  if (Array.isArray(fu)) return cleanStrings(fu).join('; ');
  const parts = [
    asString(fu.date) && `Next visit: ${asString(fu.date)}`,
    asString(fu.duration) && `After: ${asString(fu.duration)}`,
    asString(fu.reports) && `Reports: ${asString(fu.reports)}`,
    asString(fu.instructions),
  ].filter(Boolean);
  return parts.join(' • ');
}

// Map any session status onto the two report states the UI cares about.
const toReportStatus = (status: unknown): 'Draft' | 'Completed' =>
  status === 'Completed' ? 'Completed' : 'Draft';

// Best timestamp for chronological ordering / display.
const visitTimeOf = (c: any): string =>
  asString(c?.updatedAt) || asString(c?.createdAt) || asString(c?.date);

/**
 * Assemble the full, chronologically-ordered (oldest → newest) consultation
 * history for one patient. Pass `order: 'desc'` to reverse it.
 */
export async function buildPatientHistory(
  patientId: string,
  order: 'asc' | 'desc' = 'asc',
): Promise<ConsultationHistoryItem[]> {
  // Pull everything for this patient in parallel from the existing collections.
  const [consultations, reports, transcripts] = await Promise.all([
    consultationsRepo.findBy({ patientId }),
    reportsRepo.findBy({ patientId }),
    transcriptsRepo.findBy({ patientId }),
  ]);

  // Index report/transcript records by the keys we link on (id and the explicit
  // consultationId) so we can resolve reportId / transcriptId cheaply.
  const reportIds = new Set<string>();
  for (const r of reports as any[]) {
    if (r?.id) reportIds.add(r.id);
    if (r?.consultationId) reportIds.add(r.consultationId);
  }
  const transcriptById = new Map<string, any>();
  for (const t of transcripts as any[]) {
    if (t?.id) transcriptById.set(t.id, t);
    if (t?.consultationId) transcriptById.set(t.consultationId, t);
  }

  const items: ConsultationHistoryItem[] = (consultations as any[]).map((c) => {
    const report = c?.report || {};
    const transcript = transcriptById.get(c.id);
    const hasReportRecord = reportIds.has(c.id);
    const hasReport = hasReportRecord || Object.keys(report).length > 0;

    return {
      consultationId: c.id,
      visitDateTime: visitTimeOf(c),
      doctorName: asString(c?.doctorName),
      chiefComplaints: extractChiefComplaints(report),
      diagnosis: extractDiagnosis(report),
      medicines: extractMedicines(report, c),
      reportStatus: toReportStatus(c?.status),
      followUp: extractFollowUp(report),
      reportId: hasReportRecord ? c.id : null,
      transcriptId: transcript ? (transcript.id as string) : null,
      hasReport,
      transcriptText:
        asString(c?.transcriptText) || asString(transcript?.transcriptText) || '',
    };
  });

  // Chronological by visit time. Items with no parseable date sink to the end.
  items.sort((a, b) => {
    const ta = Date.parse(a.visitDateTime) || 0;
    const tb = Date.parse(b.visitDateTime) || 0;
    return order === 'desc' ? tb - ta : ta - tb;
  });

  return items;
}
