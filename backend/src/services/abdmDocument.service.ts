// Turn one finished consultation into an ABDM-shaped FHIR document.
//
// This is the seam between what the clinic actually recorded and what ABDM will
// eventually ask for. The document BUILDER (integrations/abdm/fhirBundle.ts) is
// pure and has no idea where anything comes from; this file is the only place
// that knows a consultation lives in MediScribe, a patient in ClinicBook, and
// an ABHA number on the patient row.
//
// It lives in services/ because it reads across both products, which core/ may
// not do and a single product should not.
//
// NOTHING here talks to ABDM. There is no gateway, no credentials, no network
// call — the sandbox account does not exist yet. What this gives us is the
// ability to look at a real consultation and see exactly what would be sent,
// which is the part worth getting right before anything is transmitted.

import { prisma } from '../config/prisma.js';
import { runWithClinic } from '../products/mediscribe/context.js';
import { consultationsRepo } from '../products/mediscribe/repositories/index.js';
import {
  buildConsultationBundle,
  type ConsultationInput,
  type Medicine
} from '../integrations/abdm/fhirBundle.js';
import type { Consultation, MedicationRow } from '../products/mediscribe/shared/types.js';

export class NotShareable extends Error {}

/**
 * A medication row in the shape the document builder wants.
 *
 * The two differ because the clinic's report carries columns a prescription
 * needs (route, timing) that the narrative text does not use. Mapping here
 * rather than widening the builder keeps the builder ignorant of our storage.
 */
const toMedicine = (m: MedicationRow): Medicine => ({
  medicine: m.medicine,
  strength: m.strength,
  dose: m.dose,
  frequency: m.frequency,
  duration: m.duration,
  instructions: m.instructions
});

/**
 * The FHIR document for one consultation, or a refusal.
 *
 * Refuses a consultation that is not `Completed`. That status is the doctor's
 * approval — the single act that separates an AI draft from a clinical record —
 * and a draft must never leave the building, least of all into a national health
 * record. The same rule already gates sending a prescription to the patient;
 * this is the same gate, stated again at a second exit.
 */
export const buildDocumentFor = async (
  clinicId: string,
  consultationId: string
): Promise<Record<string, unknown>> => {
  const consultation = (await runWithClinic(clinicId, () =>
    consultationsRepo.findById(consultationId)
  )) as Consultation | null;

  if (!consultation) throw new NotShareable('No such consultation.');
  if (consultation.status !== 'Completed') {
    throw new NotShareable('This consultation has not been finalised by the doctor yet.');
  }
  if (!consultation.report) {
    throw new NotShareable('This consultation has no report to share.');
  }

  const patient = await prisma.patient.findFirst({
    where: { id: consultation.patientId, clinicId },
    select: {
      id: true,
      name: true,
      gender: true,
      phone: true,
      abhaNumber: true,
      abhaAddress: true
    }
  });
  if (!patient) throw new NotShareable('The patient on this consultation no longer exists.');

  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { id: true, name: true, hfrId: true }
  });
  if (!clinic) throw new NotShareable('Clinic not found.');

  // Which doctor. A consultation records the appointment's doctor when there is
  // one; when there is not, the document still has to name a practitioner, so
  // the clinic name is used and the registration number is simply absent. An
  // absent identifier is honest — a made-up one is not.
  const doctor = await prisma.doctor.findFirst({
    where: { clinicId, appointments: { some: { patientId: patient.id } } },
    orderBy: { appointments: { _count: 'desc' } },
    select: { name: true, hprId: true }
  });

  const report = consultation.report;

  const input: ConsultationInput = {
    consultationId: consultation.id,
    recordedAt: consultation.updatedAt ?? consultation.createdAt ?? consultation.date,
    patient: {
      id: patient.id,
      name: patient.name,
      gender: patient.gender,
      phone: patient.phone,
      // Both omitted unless the patient actually linked their ABHA. The builder
      // leaves the identifier out entirely rather than emitting an empty one.
      abhaNumber: patient.abhaNumber,
      abhaAddress: patient.abhaAddress
    },
    practitioner: {
      name: doctor?.name ?? clinic.name,
      registrationNumber: doctor?.hprId ?? null
    },
    organization: {
      // The HFR id when the clinic is registered with ABDM; our own id until
      // then, so the document is still internally consistent and traceable.
      id: clinic.hfrId ?? clinic.id,
      name: clinic.name
    },
    report: {
      chiefComplaint: report.chiefComplaint ?? [],
      clinicalOverview: report.clinicalOverview,
      assessment: report.assessment ?? [],
      advice: report.advice ?? [],
      prescribedMedications: (report.prescribedMedications ?? []).map(toMedicine)
    }
  };

  return buildConsultationBundle(input) as Record<string, unknown>;
};

/**
 * What is still missing before this document could actually go to ABDM.
 *
 * Returned as a list rather than thrown, because every one of these is a
 * real-world registration step someone has to complete — not a bug — and the
 * clinic needs to see all of them at once instead of discovering them one
 * failure at a time.
 */
export const abdmReadiness = async (clinicId: string, patientId?: string): Promise<string[]> => {
  const gaps: string[] = [];

  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { hfrId: true } });
  if (!clinic?.hfrId) gaps.push('The clinic is not registered on the Health Facility Registry (no HFR id).');

  const doctorsWithoutHpr = await prisma.doctor.count({ where: { clinicId, hprId: null } });
  if (doctorsWithoutHpr > 0) {
    gaps.push(
      `${doctorsWithoutHpr} doctor(s) have no HPR id. Each doctor registers themselves on the ` +
        'Healthcare Professional Registry; the clinic cannot do it for them.'
    );
  }

  if (patientId) {
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, clinicId },
      select: { abhaNumber: true, abhaAddress: true }
    });
    if (!patient?.abhaNumber && !patient?.abhaAddress) {
      gaps.push('This patient has not linked an ABHA. Nothing can be shared to ABDM for them.');
    }
  }

  return gaps;
};
