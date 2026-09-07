// Linking a clinic's visits into a patient's national health record.
//
// Composes three things that must not know about each other: the ABDM
// integration, ClinicBook's appointments, and the patient record. Lives in
// services/ for the same reason ABHA enrolment does — core may not import an
// integration, and that rule is what keeps ABDM optional.
//
// ── The flow is split across two requests, and cannot be joined ────────────
//
//   startLinking()   asks ABDM for a link token           → 202, nothing more
//   ...ABDM calls our callback with the token...
//   completeLinking() pushes the visits using that token
//
// Nothing here can wait for the token: it arrives on a different connection,
// seconds later, through the HIP callback router.

import { AppointmentStatus } from '@prisma/client';

import { prisma } from '../config/prisma.js';
import { forClinic } from '../config/tenantPrisma.js';
import { AppError } from '../utils/AppError.js';
import {
  linkCareContexts,
  requestLinkToken,
  type CareContextToLink
} from '../integrations/abdm/abdmLink.service.js';

/** How far back a visit is still worth putting into a national record. */
const LINKABLE_MONTHS = 24;

/**
 * A link token is valid for six months. Refreshed a fortnight early, because a
 * token that expires between the request and the push fails a link the patient
 * has already been told about.
 */
const TOKEN_LIFETIME_MS = 180 * 24 * 60 * 60_000;
const REFRESH_MARGIN_MS = 14 * 24 * 60 * 60_000;

/** PURE: is a stored link token still usable? */
export const linkTokenIsFresh = (issuedAt: Date | null, now = new Date()): boolean =>
  issuedAt !== null && now.getTime() - issuedAt.getTime() < TOKEN_LIFETIME_MS - REFRESH_MARGIN_MS;

interface LinkablePatient {
  id: string;
  name: string;
  gender: string | null;
  age: number | null;
  abhaAddress: string | null;
  abhaVerified: boolean;
  abdmLinkToken: string | null;
  abdmLinkTokenAt: Date | null;
}

const loadPatient = async (clinicId: string, patientId: string): Promise<LinkablePatient> => {
  const patient = await forClinic(clinicId).patient.findFirst({
    where: { id: patientId },
    select: {
      id: true,
      name: true,
      gender: true,
      age: true,
      abhaAddress: true,
      abhaVerified: true,
      abdmLinkToken: true,
      abdmLinkTokenAt: true
    }
  });
  if (!patient) throw new AppError('Patient not found', 404);
  return patient;
};

/** The clinic's facility id. Without it ABDM has no idea who is asking. */
const hipIdFor = async (clinicId: string): Promise<string> => {
  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { hfrId: true } });
  if (!clinic?.hfrId) {
    throw new AppError(
      'This clinic has no HFR id yet. Register the facility with ABDM and enter the id under Admin → ABDM.',
      400
    );
  }
  return clinic.hfrId;
};

/**
 * Visits worth linking.
 *
 * Only completed ones. A care context CANNOT be unlinked once pushed, so a
 * cancelled booking or a no-show sent by mistake stays in that person's
 * national record permanently. That is the reason this filter is strict rather
 * than convenient.
 */
const linkableVisits = async (clinicId: string, patientId: string): Promise<CareContextToLink[]> => {
  const since = new Date();
  since.setMonth(since.getMonth() - LINKABLE_MONTHS);

  const visits = await prisma.appointment.findMany({
    where: {
      clinicId,
      patientId,
      status: AppointmentStatus.COMPLETED,
      appointmentDate: { gte: since }
    },
    orderBy: { appointmentDate: 'desc' },
    select: { id: true, appointmentDate: true, doctor: { select: { name: true } } },
    take: 100
  });

  return visits.map((v) => ({
    referenceNumber: v.id,
    display: `Consultation on ${v.appointmentDate.toISOString().slice(0, 10)}${
      v.doctor?.name ? ` with ${v.doctor.name}` : ''
    }`
  }));
};

export interface LinkingStarted {
  status: 'requested' | 'ready';
  message: string;
}

/**
 * Begin linking this patient's visits.
 *
 * Returns 'ready' when a stored token was still good and the push has already
 * happened; 'requested' when ABDM has to call us back first.
 */
export const startLinking = async (clinicId: string, patientId: string): Promise<LinkingStarted> => {
  const patient = await loadPatient(clinicId, patientId);

  if (!patient.abhaAddress) {
    throw new AppError('This patient has no ABHA address, so there is nothing to link to.', 400);
  }
  // An unverified ABHA is one the patient typed at us. Pushing a clinic's
  // records against it would write this patient's visits into whoever that
  // address really belongs to — and they cannot be unlinked afterwards.
  if (!patient.abhaVerified) {
    throw new AppError(
      "This patient's ABHA has not been confirmed yet. Check it against their ABHA card first.",
      400
    );
  }

  const visits = await linkableVisits(clinicId, patientId);
  if (!visits.length) {
    throw new AppError('This patient has no completed visits to link.', 400);
  }

  const hipId = await hipIdFor(clinicId);

  // Reuse a live token rather than asking again: three requests for the same
  // ABHA address in a day gets the whole facility blocked for 24 hours.
  if (patient.abdmLinkToken && linkTokenIsFresh(patient.abdmLinkTokenAt)) {
    await completeLinking(clinicId, patientId, patient.abdmLinkToken);
    return { status: 'ready', message: `${visits.length} visit(s) linked.` };
  }

  await requestLinkToken({
    hipId,
    abhaAddress: patient.abhaAddress,
    name: patient.name,
    gender: patient.gender,
    age: patient.age
  });

  return {
    status: 'requested',
    message: 'ABDM is confirming this patient. The visits will be linked in a moment.'
  };
};

/**
 * Push the visits, with a token we now hold.
 *
 * Called from two places: directly, when a stored token was still fresh, and
 * from the callback router the moment ABDM delivers a new one.
 */
export const completeLinking = async (
  clinicId: string,
  patientId: string,
  linkToken: string
): Promise<number> => {
  const patient = await loadPatient(clinicId, patientId);
  if (!patient.abhaAddress) return 0;

  const visits = await linkableVisits(clinicId, patientId);
  if (!visits.length) return 0;

  await linkCareContexts({
    hipId: await hipIdFor(clinicId),
    linkToken,
    abhaAddress: patient.abhaAddress,
    patientReference: patient.id,
    patientDisplay: patient.name,
    careContexts: visits,
    // Consultations are what this platform produces. Other HI types come with
    // the documents that carry them.
    hiType: 'OPConsultation'
  });

  // Stored only after a successful push. Saving it earlier would leave a token
  // recorded as usable when the one thing it was needed for had just failed.
  await forClinic(clinicId).patient.update({
    where: { id: patientId },
    data: { abdmLinkToken: linkToken, abdmLinkTokenAt: new Date() }
  });

  console.info(`[ABDM] linked ${visits.length} care context(s) for patient ${patientId}`);
  return visits.length;
};

/**
 * Find the patient a link token belongs to.
 *
 * ABDM's callback identifies them by ABHA address, not by our id, so this is
 * how the answer gets back to the right record. Scoped by facility: two clinics
 * may both know a patient with the same ABHA, and only the one that asked
 * should act on the reply.
 */
export const patientForAbhaAddress = async (
  hipId: string,
  abhaAddress: string
): Promise<{ clinicId: string; patientId: string } | null> => {
  const clinic = await prisma.clinic.findFirst({ where: { hfrId: hipId }, select: { id: true } });
  if (!clinic) return null;

  const patient = await prisma.patient.findFirst({
    where: {
      clinicId: clinic.id,
      abhaAddress: { equals: abhaAddress, mode: 'insensitive' },
      abhaVerified: true
    },
    select: { id: true }
  });
  return patient ? { clinicId: clinic.id, patientId: patient.id } : null;
};
