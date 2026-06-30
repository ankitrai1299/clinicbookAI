// Builds the "Previous Consultation History" for a patient — read-only grouping
// of their consultations with linked report/transcript data. Ported from the
// reference app (clinic-scoped repos).

import { consultationsRepo, reportsRepo, transcriptsRepo } from './repo.js';

export interface HistoryMedicine {
  medicine: string; strength: string; dose: string; frequency: string; duration: string; instructions: string;
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

const asString = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const cleanStrings = (v: unknown): string[] => (Array.isArray(v) ? v.map(asString).filter(Boolean) : []);

const extractChiefComplaints = (report: any): string[] => {
  const flat = cleanStrings(report?.chiefComplaint);
  if (flat.length) return flat;
  if (Array.isArray(report?.chiefComplaints)) {
    return report.chiefComplaints
      .map((c: any) =>
        typeof c === 'string'
          ? c.trim()
          : [c?.complaint, c?.duration, c?.severity].map(asString).filter(Boolean).join(' — ')
      )
      .filter(Boolean);
  }
  return [];
};

const extractDiagnosis = (report: any): string[] => cleanStrings(report?.assessment);

const extractMedicines = (report: any, consultation: any): HistoryMedicine[] => {
  const rows = Array.isArray(report?.prescribedMedications)
    ? report.prescribedMedications
    : Array.isArray(consultation?.prescriptions)
      ? consultation.prescriptions
      : [];
  return rows
    .map((m: any) => ({
      medicine: asString(m?.medicine),
      strength: asString(m?.strength),
      dose: asString(m?.dose) || asString(m?.dosage),
      frequency: asString(m?.frequency),
      duration: asString(m?.duration),
      instructions: asString(m?.instructions)
    }))
    .filter((m: HistoryMedicine) => Object.values(m).some(Boolean));
};

const extractFollowUp = (report: any): string => {
  const fu = report?.followUp;
  if (!fu) return '';
  if (typeof fu === 'string') return fu.trim();
  if (Array.isArray(fu)) return cleanStrings(fu).join('; ');
  const parts = [
    asString(fu.date) && `Next visit: ${asString(fu.date)}`,
    asString(fu.duration) && `After: ${asString(fu.duration)}`,
    asString(fu.reports) && `Reports: ${asString(fu.reports)}`,
    asString(fu.instructions)
  ].filter(Boolean);
  return parts.join(' • ');
};

const toReportStatus = (status: unknown): 'Draft' | 'Completed' => (status === 'Completed' ? 'Completed' : 'Draft');
const visitTimeOf = (c: any): string => asString(c?.updatedAt) || asString(c?.createdAt) || asString(c?.date);

export const buildPatientHistory = async (
  clinicId: string,
  patientId: string,
  order: 'asc' | 'desc' = 'asc'
): Promise<ConsultationHistoryItem[]> => {
  const [consultations, reports, transcripts] = await Promise.all([
    consultationsRepo.findByPatient(clinicId, patientId),
    reportsRepo.findByPatient(clinicId, patientId),
    transcriptsRepo.findByPatient(clinicId, patientId)
  ]);

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
    return {
      consultationId: c.id,
      visitDateTime: visitTimeOf(c),
      chiefComplaints: extractChiefComplaints(report),
      diagnosis: extractDiagnosis(report),
      medicines: extractMedicines(report, c),
      reportStatus: toReportStatus(c?.status),
      followUp: extractFollowUp(report),
      reportId: hasReportRecord ? c.id : null,
      transcriptId: transcript ? (transcript.id as string) : null,
      hasReport: hasReportRecord || Object.keys(report).length > 0,
      transcriptText: asString(c?.transcriptText) || asString(transcript?.transcriptText) || ''
    };
  });

  items.sort((a, b) => {
    const ta = Date.parse(a.visitDateTime) || 0;
    const tb = Date.parse(b.visitDateTime) || 0;
    return order === 'desc' ? tb - ta : ta - tb;
  });

  return items;
};
