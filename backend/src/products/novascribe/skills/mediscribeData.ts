// Shared read helper for the patient-facing WhatsApp scribe skills. Links a
// WhatsApp patient (identified by phone) to their MediScribe records: MediScribe
// stores its own patients (NovaDoc 'patients') keyed by its own id, so we match
// on phone (digit-normalised) to find the patient, then fetch their latest
// consultation that already has a generated report. Read-only, clinic-scoped.

import { prisma } from '../../../config/prisma.js';

const digitsOf = (s: unknown): string => (typeof s === 'string' ? s : '').replace(/\D/g, '');
const last10 = (s: unknown): string => digitsOf(s).slice(-10);

export interface MedRow {
  medicine?: string;
  dosage?: string;
  strength?: string;
  dose?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
}

export interface ScribeReport {
  clinicalOverview?: string;
  assessment?: string[];
  advice?: string[];
  prescribedMedications?: MedRow[];
  chiefComplaint?: string[];
}

export interface ScribeConsultation {
  report: ScribeReport;
  patientName?: string;
  doctorName?: string;
  date?: string;
}

/**
 * The patient's most recent MediScribe consultation that carries a generated
 * report, linked from their WhatsApp `phone`. Returns null when the patient has
 * no MediScribe record or no report yet.
 */
export async function latestScribeConsultation(
  clinicId: string,
  phone: string | undefined | null
): Promise<ScribeConsultation | null> {
  const want = last10(phone);
  if (!want) return null;

  // 1) Find the MediScribe patient by phone (the id links to their consultations).
  const patients = await prisma.novaDoc.findMany({
    where: { clinicId, collection: 'patients' },
    select: { id: true, data: true }
  });
  const match = patients.find((p) => last10((p.data as Record<string, unknown> | null)?.phone) === want);
  if (!match) return null;

  // 2) Latest consultation for that patient that already has a report.
  const rows = await prisma.novaDoc.findMany({
    where: { clinicId, collection: 'consultations', patientId: match.id },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    select: { data: true }
  });
  for (const r of rows) {
    const d = r.data as Record<string, unknown> & { report?: ScribeReport };
    if (d?.report) {
      return {
        report: d.report,
        patientName: d.patientName as string | undefined,
        doctorName: d.doctorName as string | undefined,
        date: d.date as string | undefined
      };
    }
  }
  return null;
}
