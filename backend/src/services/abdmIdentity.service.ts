// A patient's ABHA — their national health identity — and where it gets typed in.
//
// ── Why this is not part of updatePatient ──────────────────────────────────
//
// Patients are read and written through PatientPort so an EMR-backed clinic can
// keep its list in the EMR, and that port's `update` throws 501 for those
// clinics. An ABHA is not clinical data and not the EMR's to own: it is
// Anvaya's mapping from our record to a government registry, exactly like a
// doctor's HPR id. Routing it through the port would bar EMR-backed clinics
// from ABDM entirely, for no reason — so it writes straight to our own row.
//
// ── The duplicate check lives here on purpose ──────────────────────────────
//
// Patient.abhaNumber carries no unique constraint, and the schema says why: one
// person has one ABHA but may be a patient at several clinics, so it cannot be
// globally unique, and a database constraint would surface as an opaque write
// failure somewhere nobody can act on it. The check belongs where there is a
// human to tell — which is here, with the front desk waiting.
//
// It matters more than a tidy-data argument. Two patients at one clinic sharing
// an ABHA makes ABDM discovery permanently ambiguous for that person: the
// matcher refuses to guess, so they can never reach their own records, and
// nothing on screen would ever explain why.

import { forClinic } from '../config/tenantPrisma.js';
import { AppError } from '../utils/AppError.js';

/**
 * PURE: an ABHA number is 14 digits, usually written 12-3456-7890-1234.
 *
 * Stored with the dashes, which is how it appears on the patient's card and on
 * every government screen — a desk checking one against a card should be
 * comparing like with like.
 */
export const normaliseAbhaNumber = (raw: unknown): string | null => {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length !== 14) {
    throw new AppError('An ABHA number is 14 digits, like 12-3456-7890-1234.', 400);
  }
  return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}-${digits.slice(10)}`;
};

/**
 * PURE: an ABHA address looks like an email — asha@sbx, asha.verma@abdm.
 *
 * Lower-cased on the way in. ABDM sends the address back in discovery and
 * compares it as-is; a desk that typed "Asha@sbx" would otherwise create a
 * patient who can never be matched.
 */
export const normaliseAbhaAddress = (raw: unknown): string | null => {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) return null;
  if (!/^[a-z0-9](?:[a-z0-9._-]{1,48})?@[a-z0-9]{2,20}$/.test(value)) {
    throw new AppError('An ABHA address looks like asha@abdm or asha.verma@sbx.', 400);
  }
  return value;
};

export interface AbhaInput {
  abhaNumber?: unknown;
  abhaAddress?: unknown;
}

export interface PatientAbha {
  id: string;
  name: string;
  abhaNumber: string | null;
  abhaAddress: string | null;
  abhaLinkedAt: Date | null;
}

/**
 * Is someone else at this clinic already carrying this ABHA?
 *
 * Names the other patient in the message. "Already in use" alone would leave
 * the desk with a refusal and no way to act on it; with the name they can see
 * at a glance whether it is a duplicate record of the same person or a typo.
 */
const refuseIfTaken = async (
  clinicId: string,
  patientId: string,
  field: 'abhaNumber' | 'abhaAddress',
  value: string | null
): Promise<void> => {
  if (!value) return;
  const clash = await forClinic(clinicId).patient.findFirst({
    where: { [field]: value, NOT: { id: patientId } },
    select: { name: true }
  });
  if (clash) {
    const label = field === 'abhaNumber' ? 'ABHA number' : 'ABHA address';
    throw new AppError(
      `That ${label} is already on ${clash.name}'s record at this clinic. ` +
        'Two patients cannot share one ABHA — if they are the same person, merge the records instead.',
      409
    );
  }
};

/**
 * Record (or clear) a patient's ABHA.
 *
 * Blank CLEARS, as it does for the HFR and HPR ids: an identity typed onto the
 * wrong patient has to be removable, and there is no format check that would
 * catch it being simply the wrong person's.
 *
 * abhaLinkedAt is stamped when an identity first appears and cleared when both
 * are removed, so "when did this patient join ABDM" stays answerable.
 */
export const setPatientAbha = async (
  clinicId: string,
  patientId: string,
  input: AbhaInput
): Promise<PatientAbha> => {
  const db = forClinic(clinicId);
  const existing = await db.patient.findFirst({
    where: { id: patientId },
    select: { id: true, abhaNumber: true, abhaAddress: true, abhaLinkedAt: true }
  });
  if (!existing) throw new AppError('Patient not found', 404);

  const data: Record<string, unknown> = {};
  if (input.abhaNumber !== undefined) {
    const value = normaliseAbhaNumber(input.abhaNumber);
    await refuseIfTaken(clinicId, patientId, 'abhaNumber', value);
    data.abhaNumber = value;
  }
  if (input.abhaAddress !== undefined) {
    const value = normaliseAbhaAddress(input.abhaAddress);
    await refuseIfTaken(clinicId, patientId, 'abhaAddress', value);
    data.abhaAddress = value;
  }
  if (!Object.keys(data).length) {
    throw new AppError('Nothing to update — send abhaNumber or abhaAddress.', 400);
  }

  const willHaveNumber = 'abhaNumber' in data ? data.abhaNumber : existing.abhaNumber;
  const willHaveAddress = 'abhaAddress' in data ? data.abhaAddress : existing.abhaAddress;
  const linked = Boolean(willHaveNumber || willHaveAddress);
  data.abhaLinkedAt = linked ? existing.abhaLinkedAt ?? new Date() : null;

  const updated = await db.patient.update({
    where: { id: patientId },
    data,
    select: { id: true, name: true, abhaNumber: true, abhaAddress: true, abhaLinkedAt: true }
  });

  // Not audited as a clinical change, but it IS the moment a patient becomes
  // reachable through ABDM, and someone will one day ask when that happened.
  console.info(
    `[ABDM] patient ${updated.id} ABHA ${linked ? 'recorded' : 'cleared'} at clinic ${clinicId}`
  );
  return updated;
};

/** What the dashboard shows for a patient's ABDM identity. */
export const getPatientAbha = async (clinicId: string, patientId: string): Promise<PatientAbha> => {
  const patient = await forClinic(clinicId).patient.findFirst({
    where: { id: patientId },
    select: { id: true, name: true, abhaNumber: true, abhaAddress: true, abhaLinkedAt: true }
  });
  if (!patient) throw new AppError('Patient not found', 404);
  return patient;
};
