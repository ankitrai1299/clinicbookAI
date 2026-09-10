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

import { env } from '../config/env.js';
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
  /**
   * What the clinic needs in front of them to finish the linkage step, served
   * from here rather than written into the screen.
   *
   * The bridge id and the portal are DIFFERENT in sandbox and in production, so
   * a value typed into the frontend would be right in one deployment and
   * quietly wrong in the other — and "quietly wrong" here means a clinic linking
   * their facility to somebody else's software.
   */
  linkage: {
    /** Our ABDM client id, which the clinic enters as the Software Bridge ID. */
    bridgeId: string | null;
    /** Where the facility is registered and linked. */
    portalUrl: string;
    /** True while we are on the ABDM sandbox — the screen must say so. */
    sandbox: boolean;
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

/**
 * PURE-ish: are we talking to ABDM's sandbox?
 *
 * Read from the Consent Manager id, NOT from the gateway URL. That URL was the
 * obvious signal and it broke the day the calls started going through the India
 * relay: the host became a vercel.app address and the check quietly answered
 * "production", which would have sent clinics to the live facility portal and
 * hidden the warning that records shared here reach nobody's real record.
 *
 * X-CM-ID is 'sbx' for the sandbox and something else in production, it is sent
 * on every single call, and no proxy can change it without breaking those calls
 * first — so it cannot drift away from the truth unnoticed.
 */
const isSandbox = (): boolean => env.ABDM_CM_ID.trim().toLowerCase() === 'sbx';

export const getRegistryStatus = async (clinicId: string): Promise<RegistryStatus> => {
  const [clinic, doctors] = await Promise.all([
    prisma.clinic.findUnique({ where: { id: clinicId }, select: { name: true, hfrId: true } }),
    forClinic(clinicId).doctor.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, speciality: true, hprId: true },
    }),
  ]);
  if (!clinic) throw new AppError('Clinic not found', 404);

  const sandbox = isSandbox();

  return {
    facility: { clinicName: clinic.name, hfrId: clinic.hfrId },
    linkage: {
      bridgeId: env.ABDM_CLIENT_ID ?? null,
      portalUrl: sandbox ? 'https://hspsbx.abdm.gov.in' : 'https://facility.abdm.gov.in',
      sandbox,
    },
    doctors,
    complete: isRegistrationComplete(clinic.hfrId, doctors),
  };
};

/**
 * Record this clinic's HFR id — the facility identity ABDM knows it by.
 *
 * ── Why the duplicate check is not optional ────────────────────────────────
 *
 * One HFR id belongs to exactly one facility, and the whole platform serves
 * every clinic through ONE bridge and ONE callback URL. Which clinic a callback
 * is FOR is decided solely by looking this id up (`patientForAbhaAddress`). So
 * two clinics holding the same id is not an untidy row — it is a fork in the
 * road with no signpost: ABDM's answer for one clinic's patient would be
 * delivered to whichever row the query happened to return, and that clinic
 * would push its own patients' visits under the other facility's identity.
 *
 * There is no unique index behind this (a partial unique on a nullable column
 * has to be applied by hand — `prisma db push` refuses it), so this check IS
 * the constraint. It names the other clinic, because "already in use" without
 * saying where sends an admin looking through a list they may not be able to see.
 */
export const setFacilityId = async (clinicId: string, hfrId: unknown): Promise<RegistryStatus> => {
  const value = cleanRegistryId(hfrId);

  if (value) {
    const taken = await prisma.clinic.findFirst({
      where: { hfrId: value, id: { not: clinicId } },
      select: { name: true }
    });
    if (taken) {
      throw new AppError(
        `That HFR id is already recorded for ${taken.name}. One facility id belongs to one clinic — check the id on the ABDM facility portal.`,
        409
      );
    }
  }

  await prisma.clinic.update({ where: { id: clinicId }, data: { hfrId: value } });
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

// ── A doctor's OWN registration ────────────────────────────────────────────
//
// An HPR id cannot be obtained by anybody but the doctor: it is their Aadhaar,
// their council number, their OTP. The admin screen can only record an id the
// doctor has already been given, which leaves the actual work — going and
// registering — with the one person nothing in this product ever tells.
//
// So the doctor gets the same job in their own login, and the id they save is
// theirs by construction: resolved from the session, never taken from a request.

export interface MyProfessionalRegistration {
  /** False when the login is not tied to a doctor record — then there is nothing to register. */
  linked: boolean;
  doctorName: string | null;
  hprId: string | null;
  /** Where they go to get one. Sandbox and production are different registries. */
  portalUrl: string;
}

export const getMyProfessionalRegistration = async (
  clinicId: string,
  doctorId: string | null
): Promise<MyProfessionalRegistration> => {
  const sandbox = isSandbox();
  const portalUrl = sandbox ? 'https://hprsbx.abdm.gov.in' : 'https://hpr.abdm.gov.in';

  if (!doctorId) return { linked: false, doctorName: null, hprId: null, portalUrl };

  const doctor = await forClinic(clinicId).doctor.findFirst({
    where: { id: doctorId },
    select: { name: true, hprId: true }
  });
  if (!doctor) return { linked: false, doctorName: null, hprId: null, portalUrl };

  return { linked: true, doctorName: doctor.name, hprId: doctor.hprId, portalUrl };
};

/**
 * A doctor records their own HPR id.
 *
 * `doctorId` comes from the session, NOT from the request body — that is the
 * whole security property. A doctor editing "their" id can only ever reach the
 * row their login resolves to, so no id parameter exists to tamper with.
 *
 * Returns only their own registration. The admin view lists every doctor and is
 * not a doctor's to see.
 */
export const setMyProfessionalId = async (
  clinicId: string,
  doctorId: string | null,
  hprId: unknown
): Promise<MyProfessionalRegistration> => {
  if (!doctorId) {
    throw new AppError(
      'This login is not linked to a doctor record yet, so there is nothing to register. Ask the clinic admin to link it.',
      400
    );
  }

  const value = cleanRegistryId(hprId);
  if (value) {
    // Same reasoning as the facility id: one registration belongs to one person,
    // and a duplicate would mean two doctors sharing a professional identity.
    const taken = await forClinic(clinicId).doctor.findFirst({
      where: { hprId: value, id: { not: doctorId } },
      select: { name: true }
    });
    if (taken) {
      throw new AppError(
        `That HPR id is already recorded for ${taken.name}. One registration belongs to one professional.`,
        409
      );
    }
  }

  await forClinic(clinicId).doctor.update({ where: { id: doctorId }, data: { hprId: value } });
  return getMyProfessionalRegistration(clinicId, doctorId);
};
