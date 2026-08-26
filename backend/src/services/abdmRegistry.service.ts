// The two government registry ids a clinic has to obtain before anything can be
// shared with ABDM, and where they get typed in.
//
//   HFR  Health Facility Registry        the CLINIC's identity   facility.abdm.gov.in
//   HPR  Healthcare Professional Registry each DOCTOR's identity  hpr.abdm.gov.in
//
// ── Why these do NOT go through the doctor datasource port ──────────────────
//
// Doctors are normally read and written through DoctorPort, so an EMR-backed
// clinic can keep its roster in the EMR. But that port's `update` is
// ROSTER_MANAGED — it throws, because the EMR owns the roster.
//
// An HPR id is not roster data and not clinical data. It is ANVAYA's own
// annotation on the doctor: a mapping from our record to a government registry.
// Routing it through the port would mean an EMR-backed clinic could never enter
// one, and so could never use ABDM at all — a restriction with no reason behind
// it. So these write straight to our own row (which, for an EMR clinic, is the
// shadow mirror), the same way the clinic's HFR id already does.
//
// ── Why blank CLEARS rather than meaning "unchanged" ────────────────────────
//
// Every other field in this product omits an empty value and treats it as "not
// supplied". These do the opposite. A registry id has no format to validate
// against, so a typo is accepted silently — and if blank meant "leave alone",
// a wrongly-typed id could never be removed. Being able to correct a mistake
// matters more here than the convenience of a partial update.

import { prisma } from '../config/prisma.js';
import { forClinic } from '../config/tenantPrisma.js';
import { AppError } from '../utils/AppError.js';

/** One doctor's standing in the professional registry. */
export interface ProfessionalRegistration {
  id: string;
  name: string;
  speciality: string;
  /** null until the doctor registers themselves and reports the id back. */
  hprId: string | null;
}

export interface RegistryStatus {
  facility: {
    clinicName: string;
    hfrId: string | null;
  };
  doctors: ProfessionalRegistration[];
  /**
   * True only when the clinic AND every doctor is registered. Computed here
   * rather than in the UI so the dashboard, the readiness check and any future
   * caller cannot drift apart on what "done" means.
   */
  complete: boolean;
}

/** A registry id is opaque — we only refuse one long enough to be a paste error. */
export const cleanRegistryId = (raw: unknown): string | null => {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  if (value.length > 60) throw new AppError('That does not look like a registry id', 400);
  return value;
};

/**
 * Is this clinic done registering?
 *
 * Exported and pure so the rule is testable, and so the dashboard, the readiness
 * check and any future caller cannot drift apart on what "done" means.
 *
 * A clinic with NO doctors is not complete. `every()` on an empty list is true,
 * which would tell a half-onboarded clinic it was ready for ABDM.
 */
export const isRegistrationComplete = (
  hfrId: string | null,
  doctors: readonly { hprId: string | null }[]
): boolean => Boolean(hfrId) && doctors.length > 0 && doctors.every((d) => Boolean(d.hprId));

export const getRegistryStatus = async (clinicId: string): Promise<RegistryStatus> => {
  const [clinic, doctors] = await Promise.all([
    prisma.clinic.findUnique({ where: { id: clinicId }, select: { name: true, hfrId: true } }),
    forClinic(clinicId).doctor.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, speciality: true, hprId: true },
    }),
  ]);
  if (!clinic) throw new AppError('Clinic not found', 404);

  return {
    facility: { clinicName: clinic.name, hfrId: clinic.hfrId },
    doctors,
    complete: isRegistrationComplete(clinic.hfrId, doctors),
  };
};

export const setFacilityId = async (clinicId: string, hfrId: unknown): Promise<RegistryStatus> => {
  await prisma.clinic.update({ where: { id: clinicId }, data: { hfrId: cleanRegistryId(hfrId) } });
  return getRegistryStatus(clinicId);
};

export const setProfessionalId = async (
  clinicId: string,
  doctorId: string,
  hprId: unknown
): Promise<RegistryStatus> => {
  // Scoped update, so an admin of one clinic cannot stamp an id onto another
  // clinic's doctor by guessing an id.
  const db = forClinic(clinicId);
  const doctor = await db.doctor.findFirst({ where: { id: doctorId }, select: { id: true } });
  if (!doctor) throw new AppError('Doctor not found', 404);

  await db.doctor.update({ where: { id: doctorId }, data: { hprId: cleanRegistryId(hprId) } });
  return getRegistryStatus(clinicId);
};
