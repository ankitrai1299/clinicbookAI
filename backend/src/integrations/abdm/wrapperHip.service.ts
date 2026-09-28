// The facility side of ABDM, as NHA's own wrapper expects to find it.
//
// ── Why this exists next to abdmHip.service.ts ────────────────────────────
//
// We speak two ABDM dialects, and only one of them has a future.
//
// abdmHip.service.ts answers the gateway directly on the v0.5 paths: we receive
// a request, acknowledge it, and post the real answer back minutes later on a
// matching `on-` endpoint. ABDM has moved on. v0.5 is in maintenance, its
// gateway endpoints increasingly refuse with 403, and our own session code
// already notes that "V3 is the current standard and v0.5 is legacy" — while
// every HIP callback we serve was still built on v0.5.
//
// In v3 the shape is different in a way that removes most of the work: the
// protocol lives in NHA's wrapper, and the facility behind it answers plain
// SYNCHRONOUS questions. No acknowledgement dance, no callback correlation, no
// key exchange for the data transfer. The wrapper does all of it.
//
// So this module is deliberately dull. It answers four questions about our own
// patients and nothing else:
//
//   who is this ABHA address · is this person a patient of yours ·
//   what visits do they have · give me the records for these visits
//
// The interesting rule — WHICH patient a description may match — is not
// re-implemented here. It lives in abdmDiscovery.ts, it is pure, it is tested,
// and it is biased towards refusing. Two copies of that rule is how one clinic
// ends up handing over another patient's history.

import { prisma } from '../../config/prisma.js';
import { matchPatient } from './abdmDiscovery.js';
import { candidatesFor, careContextsFor, clinicForHipId } from './abdmHip.service.js';
import { buildConsultationBundle } from './fhirBundle.js';

/**
 * ABDM's fixed list of record types. A care context must declare one, and the
 * gateway rejects anything outside this set.
 *
 * Everything this product records today is an outpatient consultation, so that
 * is what we say. A prescription written during the visit is part of the same
 * consultation document, not a second care context.
 */
export const HI_TYPE = {
  OP_CONSULTATION: 'OPConsultation',
  PRESCRIPTION: 'Prescription',
  DIAGNOSTIC_REPORT: 'DiagnosticReport',
  DISCHARGE_SUMMARY: 'DischargeSummary',
  HEALTH_DOCUMENT: 'HealthDocumentRecord',
  IMMUNIZATION: 'ImmunizationRecord',
  WELLNESS: 'WellnessRecord'
} as const;

/** What the wrapper calls a patient. */
export interface WrapperPatient {
  abhaAddress: string | null;
  name: string;
  gender: 'M' | 'F' | 'O';
  dateOfBirth: string | null;
  /** OUR id for this patient — the wrapper quotes it back on every later call. */
  patientReference: string;
  /** What the patient sees in their ABHA app. */
  patientDisplay: string;
  hipId: string;
  careContexts: WrapperCareContext[];
}

export interface WrapperCareContext {
  referenceNumber: string;
  display: string;
  hiType: string;
}

const genderOf = (value: string | null | undefined): 'M' | 'F' | 'O' => {
  const v = (value ?? '').trim().toLowerCase();
  if (v.startsWith('m')) return 'M';
  if (v.startsWith('f')) return 'F';
  return 'O';
};

/**
 * Year of birth from an age, which is all this product stores.
 *
 * ABDM wants a date. We only honestly know a year, so the day and month are
 * filled with 01-01 rather than invented — a wrong birthday in a national
 * record is worse than an obviously approximate one.
 */
const dobFromAge = (age: number | null | undefined, now = new Date()): string | null =>
  typeof age === 'number' && age >= 0 && age < 130
    ? `${now.getFullYear() - age}-01-01`
    : null;

const toWrapperCareContexts = (
  rows: Array<{ referenceNumber: string; display: string }>
): WrapperCareContext[] =>
  rows.map((c) => ({ ...c, hiType: HI_TYPE.OP_CONSULTATION }));

/**
 * "Is this person a patient of yours, and what visits do they have?"
 *
 * The v3 answer goes back in the HTTP response, so unlike the v0.5 path this
 * returns a value instead of posting a callback. null means no — and no is a
 * completely ordinary answer: most people asked about have never been here.
 */
export const discoverPatient = async (
  hipId: string,
  incoming: Parameters<typeof matchPatient>[0]
): Promise<WrapperPatient | null> => {
  const clinic = await clinicForHipId(hipId);
  if (!clinic) {
    console.error(`[ABDM:v3] discovery for unknown facility ${hipId}`);
    return null;
  }

  const outcome = matchPatient(incoming, await candidatesFor(clinic.id, incoming));
  // Ambiguous is refused exactly as it is on the v0.5 path. Two patients on one
  // family phone is normal; guessing between them is not recoverable.
  if (outcome.status !== 'matched') return null;

  const careContexts = await careContextsFor(clinic.id, outcome.patient.id);
  // A patient with no completed visit has nothing to link, and an empty list
  // shows them a facility that offers them nothing.
  if (!careContexts.length) return null;

  const full = await prisma.patient.findUnique({
    where: { id: outcome.patient.id },
    select: { age: true, abhaAddress: true }
  });

  return {
    abhaAddress: full?.abhaAddress ?? outcome.patient.abhaAddress ?? null,
    name: outcome.patient.name,
    gender: genderOf(outcome.patient.gender),
    dateOfBirth: dobFromAge(full?.age),
    patientReference: outcome.patient.id,
    patientDisplay: outcome.patient.name,
    hipId,
    careContexts: toWrapperCareContexts(careContexts)
  };
};

/**
 * The visits behind an ABHA address, for a patient the wrapper already knows.
 *
 * Only a VERIFIED ABHA address matches. A patient can type any address at us
 * over WhatsApp, including someone else's; answering on an unverified one would
 * hand this clinic's records to whoever the address really belongs to.
 */
export const careContextsForAbha = async (
  hipId: string,
  abhaAddress: string
): Promise<WrapperPatient | null> => {
  const clinic = await clinicForHipId(hipId);
  if (!clinic) return null;

  const patient = await prisma.patient.findFirst({
    where: {
      clinicId: clinic.id,
      abhaVerified: true,
      abhaAddress: { equals: abhaAddress.trim(), mode: 'insensitive' }
    },
    select: { id: true, name: true, gender: true, age: true, abhaAddress: true }
  });
  if (!patient) return null;

  const careContexts = await careContextsFor(clinic.id, patient.id);
  return {
    abhaAddress: patient.abhaAddress,
    name: patient.name,
    gender: genderOf(patient.gender),
    dateOfBirth: dobFromAge(patient.age),
    patientReference: patient.id,
    patientDisplay: patient.name,
    hipId,
    careContexts: toWrapperCareContexts(careContexts)
  };
};

/** One visit's records, as the wrapper wants them: a FHIR bundle per context. */
export interface HealthInformationBundle {
  careContextReference: string;
  /** The FHIR bundle, serialised. The wrapper encrypts it; we never do. */
  bundleContent: string;
}

/**
 * The records for the visits a consent covers.
 *
 * Every care context is checked against the patient reference the wrapper sent
 * WITH it. That check is the whole security of this endpoint: without it, a
 * request naming one patient and another patient's visit would be answered
 * with the second patient's records.
 */
export const healthInformationFor = async (
  pairs: Array<{ patientReference: string; careContextReference: string }>
): Promise<HealthInformationBundle[]> => {
  const out: HealthInformationBundle[] = [];

  for (const pair of pairs) {
    const visit = await prisma.appointment.findFirst({
      // Both halves, together. An appointment id alone would be enough to read
      // any visit in the system.
      where: { id: pair.careContextReference, patientId: pair.patientReference },
      select: {
        id: true,
        clinicId: true,
        appointmentDate: true,
        appointmentTime: true,
        clinic: { select: { name: true } },
        doctor: { select: { name: true, speciality: true } },
        patient: { select: { name: true, gender: true, age: true, abhaAddress: true, phone: true } }
      }
    });

    if (!visit) {
      console.warn(
        `[ABDM:v3] care context ${pair.careContextReference} does not belong to patient ` +
          `${pair.patientReference} — refusing`
      );
      continue;
    }

    const bundle = buildConsultationBundle({
      consultationId: visit.id,
      recordedAt: visit.appointmentDate.toISOString(),
      patient: {
        id: pair.patientReference,
        name: visit.patient?.name ?? 'Patient',
        gender: visit.patient?.gender ?? null,
        phone: visit.patient?.phone ?? null,
        abhaAddress: visit.patient?.abhaAddress ?? null
      },
      practitioner: { name: visit.doctor?.name ?? 'Doctor' },
      organization: { id: visit.clinicId, name: visit.clinic?.name ?? 'Clinic' },
      // What this product actually holds for a booking-only visit: that it
      // happened, when, and with whom. Inventing a complaint or an assessment
      // to fill the document would put words in a doctor's mouth, in a national
      // record, permanently.
      report: {
        clinicalOverview:
          `Outpatient consultation on ${visit.appointmentDate.toISOString().slice(0, 10)}` +
          (visit.appointmentTime ? ` at ${visit.appointmentTime}` : '') +
          (visit.doctor?.speciality ? ` (${visit.doctor.speciality})` : '')
      }
    });

    out.push({
      careContextReference: visit.id,
      bundleContent: JSON.stringify(bundle)
    });
  }

  return out;
};
