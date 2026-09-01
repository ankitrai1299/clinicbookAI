// The work behind the HIP endpoints — everything that happens AFTER the
// acknowledgement has already gone back to the gateway.
//
// Nothing here may throw. By the time any of it runs the HTTP response is sent
// and there is no request left to fail; an exception would surface as an
// unhandled rejection somewhere unrelated. Every path therefore ends in a
// callback to the gateway, an error callback, or a log — never in a throw.

import { AppointmentStatus } from '@prisma/client';

import { prisma } from '../../config/prisma.js';
import { ABDM_ERROR, postCallback, postError } from './abdmCallback.js';
import { matchPatient, last10, type CandidatePatient, type DiscoveryPatient } from './abdmDiscovery.js';

const ON_DISCOVER = '/gateway/v0.5/care-contexts/on-discover';

/** How far back a visit is still worth offering. */
const CARE_CONTEXT_MONTHS = 24;

interface DiscoveryRequest {
  requestId?: string;
  transactionId?: string;
  patient?: DiscoveryPatient;
}

/**
 * Which clinic is this call for?
 *
 * X-HIP-ID carries the facility's HFR id, and Clinic.hfrId is where a clinic
 * records it. That column already existed for the ABDM document builder; this
 * is what makes it load-bearing — it is now the only thing tying an inbound
 * government request to one tenant's data.
 *
 * A clinic that has not entered its HFR id simply cannot be found here, which
 * is the correct outcome: it is not registered with ABDM, so no ABDM request
 * can legitimately be about it.
 */
const clinicForHipId = async (hipId: string): Promise<{ id: string; name: string } | null> =>
  prisma.clinic.findFirst({ where: { hfrId: hipId }, select: { id: true, name: true } });

/**
 * Patients who could plausibly be the person described.
 *
 * Narrowed in the database rather than loading the clinic's whole list: the
 * pure matcher is the thing that decides, but handing it every patient at a
 * busy clinic would mean reading thousands of rows to answer a question about
 * one person.
 *
 * The filter is deliberately WIDER than the matching rules — it may return
 * people the matcher then rejects. That direction is safe. A filter narrower
 * than the rules would hide an ambiguity from the matcher and turn a case it
 * would have refused into a confident wrong answer.
 */
const candidatesFor = async (
  clinicId: string,
  incoming: DiscoveryPatient
): Promise<CandidatePatient[]> => {
  const numbers = [
    ...(incoming.verifiedIdentifiers ?? []),
    ...(incoming.unverifiedIdentifiers ?? [])
  ]
    .filter((i) => i.type?.toUpperCase() === 'MOBILE')
    .map((i) => last10(i.value))
    .filter((n): n is string => Boolean(n));

  const or: object[] = numbers.map((n) => ({ phone: { endsWith: n } }));
  if (incoming.id?.includes('@')) or.push({ abhaAddress: { equals: incoming.id, mode: 'insensitive' } });
  else if (incoming.id) or.push({ abhaNumber: { contains: incoming.id.replace(/\D/g, '') } });

  // Nothing to search on. Refusing here rather than falling through to a
  // name-only query is the same rule the matcher enforces, applied earlier.
  if (!or.length) return [];

  return prisma.patient.findMany({
    where: { clinicId, OR: or },
    select: {
      id: true,
      name: true,
      phone: true,
      gender: true,
      abhaNumber: true,
      abhaAddress: true,
      abhaVerified: true
    },
    take: 25
  });
};

/**
 * The visits we can offer for a patient.
 *
 * Only visits that actually happened. A cancelled booking is not a care
 * context, and neither is a no-show — offering either would put an encounter in
 * someone's national health record that never took place.
 */
const careContextsFor = async (clinicId: string, patientId: string) => {
  const since = new Date();
  since.setMonth(since.getMonth() - CARE_CONTEXT_MONTHS);

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
    // What the patient sees in their health app when choosing what to link, so
    // it has to read as a visit they remember — a date and who they saw.
    display: `Consultation on ${v.appointmentDate.toISOString().slice(0, 10)}${
      v.doctor?.name ? ` with ${v.doctor.name}` : ''
    }`
  }));
};

/**
 * "Is this person a patient of yours?" — answered to the gateway, never to the
 * caller.
 */
export const handleDiscovery = async (hipId: string | null, body: DiscoveryRequest): Promise<void> => {
  const requestId = body.requestId;
  const transactionId = body.transactionId;
  const incoming = body.patient;

  // Without a requestId there is nowhere to send an answer: the gateway matches
  // callbacks by it, so one sent without it is silently dropped.
  if (!requestId) {
    console.error('[ABDM] discovery received with no requestId — cannot answer');
    return;
  }
  const respondingTo = { requestId };

  if (!hipId) {
    console.error('[ABDM] discovery received with no X-HIP-ID header');
    await postError(ON_DISCOVER, ABDM_ERROR.UNKNOWN_FACILITY, respondingTo, { transactionId });
    return;
  }
  if (!incoming?.id) {
    await postError(ON_DISCOVER, ABDM_ERROR.NO_PATIENT_FOUND, respondingTo, { transactionId });
    return;
  }

  const clinic = await clinicForHipId(hipId);
  if (!clinic) {
    console.error(`[ABDM] discovery for unknown facility ${hipId}`);
    await postError(ON_DISCOVER, ABDM_ERROR.UNKNOWN_FACILITY, respondingTo, { transactionId });
    return;
  }

  const outcome = matchPatient(incoming, await candidatesFor(clinic.id, incoming));

  if (outcome.status === 'ambiguous') {
    // Not a failure. The gateway takes this back to the patient and asks them
    // to identify themselves more precisely, which is the only safe resolution.
    await postError(ON_DISCOVER, ABDM_ERROR.MULTIPLE_PATIENTS_FOUND, respondingTo, { transactionId });
    return;
  }
  if (outcome.status === 'none') {
    // Also completely normal: most people asked about have never been here.
    await postError(ON_DISCOVER, ABDM_ERROR.NO_PATIENT_FOUND, respondingTo, { transactionId });
    return;
  }

  const careContexts = await careContextsFor(clinic.id, outcome.patient.id);

  // A patient we know, with no completed visit, is still NO match as far as
  // ABDM is concerned — there is nothing to link, and answering with an empty
  // list makes the patient's app show a facility that offers them nothing.
  if (!careContexts.length) {
    await postError(ON_DISCOVER, ABDM_ERROR.NO_PATIENT_FOUND, respondingTo, { transactionId });
    return;
  }

  await postCallback(
    ON_DISCOVER,
    {
      transactionId,
      patient: {
        referenceNumber: outcome.patient.id,
        display: outcome.patient.name,
        careContexts,
        matchedBy: outcome.matchedBy
      },
      error: null
    },
    respondingTo
  );

  console.info(
    `[ABDM] discovery matched patient at ${clinic.name} by ${outcome.matchedBy.join('+')}, ` +
      `${careContexts.length} care context(s) offered`
  );
};
