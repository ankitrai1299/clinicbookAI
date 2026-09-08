// A patient creating or confirming their own ABHA, on the public registration
// page — no clinic staff involved, and nobody logged in.
//
// ── Why this is not simply the desk's enrolment with the guard removed ──────
//
// The desk's version answers to an authenticated clinic admin who is standing
// next to the patient. This one answers to anyone holding a link, so it has to
// assume the caller is not the patient, is not the clinic, and is not friendly.
//
// Two consequences shape the whole file:
//
//   1. The result of a successful OTP is NOT returned to the browser as
//      something to send back at registration. It is written here and the
//      browser is given only a transaction id. Otherwise registration would be
//      accepting `{ abhaNumber, verified: true }` from a stranger — and an ABHA
//      the system believes is verified is one ABDM hands records to.
//
//   2. Aadhaar is checked against UIDAI, by us, on request. That is a thing
//      worth being able to do a few times a day and not a few thousand, so the
//      route in front of this is throttled far harder than the rest of the
//      public API.
//
// ── Aadhaar is not stored ──────────────────────────────────────────────────
//
// Same rule as everywhere else in this integration, and it is a legal one, not
// a preference: the number is encrypted with ABDM's public key, sent, and
// dropped. It is not written to a column, an audit row, or a log line.

import { prisma } from '../config/prisma.js';
import { forClinic } from '../config/tenantPrisma.js';
import { AppError } from '../utils/AppError.js';
import { enrolByAadhaar, requestAadhaarOtp } from '../integrations/abdm/abdmEnrolment.service.js';
import { createPublicPatient } from '../core/patients/patient.service.js';
import type { PublicRegisterPatientInput } from '../core/patients/patient.schemas.js';
import type { PatientRecord } from '../core/datasource/ports.js';

/**
 * How long a verified enrolment waits for its registration.
 *
 * Long enough for someone to finish typing a form on a phone, short enough that
 * a fragment of a person's identity is not lying about. Registration is the
 * very next step, so this is generous already.
 */
const SESSION_TTL_MS = 30 * 60_000;

const clinicMustExist = async (clinicId: string): Promise<void> => {
  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { id: true } });
  if (!clinic) throw new AppError('Clinic not found', 404);
};

export interface PublicOtpStarted {
  txnId: string;
  message?: string;
}

/**
 * Send an OTP to the mobile registered against this Aadhaar.
 *
 * The clinic is checked first so a bad link cannot be used to reach UIDAI
 * through us at all.
 */
export const startPublicAbhaOtp = async (
  clinicId: string,
  aadhaar: string
): Promise<PublicOtpStarted> => {
  await clinicMustExist(clinicId);
  const started = await requestAadhaarOtp(aadhaar);
  return { txnId: started.txnId, message: started.message };
};

export interface PublicAbhaVerified {
  /** Shown back so the patient can see it worked. */
  abhaNumber: string | null;
  abhaAddress: string | null;
  /** True when ABDM already had one, rather than minting a new one. */
  alreadyExisted: boolean;
  /**
   * The Aadhaar record's own name, gender and year of birth.
   *
   * Returned so the form can SHOW what it is about to save. Not a leak: the
   * person just proved they can read an OTP sent to that Aadhaar's registered
   * mobile, and this is their own record being shown back to them.
   *
   * The form cannot lie with them either — it is the server's stored copy, not
   * anything posted back, that fills the patient record.
   */
  name?: string;
  gender?: string;
  yearOfBirth?: string;
}

/**
 * Finish the OTP, and keep the result until registration asks for it.
 *
 * The ABHA token ABDM returns is deliberately dropped, exactly as in the desk's
 * flow: it is a credential to this person's national health account, and the
 * only thing it was needed for has just finished.
 */
export const verifyPublicAbhaOtp = async (
  clinicId: string,
  txnId: string,
  otp: string,
  mobile: string
): Promise<PublicAbhaVerified> => {
  await clinicMustExist(clinicId);

  const created = await enrolByAadhaar(txnId, otp, mobile);
  if (!created.abhaNumber && !created.abhaAddress) {
    throw new AppError('ABDM completed the check but returned no ABHA.', 502);
  }

  // Keyed by ABDM's own txnId, which the browser already holds — so there is no
  // second secret to invent, and nothing extra for the page to keep.
  // Anything too old to be usable goes now, so nobody's name sits here waiting
  // for a registration that was abandoned.
  await prisma.abhaEnrolmentSession
    .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - SESSION_TTL_MS) } } })
    .catch(() => undefined);

  const sessionId = created.txnId ?? txnId;
  await prisma.abhaEnrolmentSession.upsert({
    where: { txnId: sessionId },
    create: {
      txnId: sessionId,
      clinicId,
      abhaNumber: created.abhaNumber,
      abhaAddress: created.abhaAddress,
      name: created.name,
      gender: created.gender,
      yearOfBirth: created.yearOfBirth
    },
    update: {
      abhaNumber: created.abhaNumber,
      abhaAddress: created.abhaAddress,
      name: created.name,
      gender: created.gender,
      yearOfBirth: created.yearOfBirth
    }
  });

  return {
    abhaNumber: created.abhaNumber,
    abhaAddress: created.abhaAddress,
    alreadyExisted: created.alreadyExisted,
    name: created.name,
    gender: created.gender,
    yearOfBirth: created.yearOfBirth
  };
};

/** PURE: an age, from the year ABDM gave us. */
export const ageFromYearOfBirth = (
  yearOfBirth: string | null | undefined,
  now = new Date()
): number | null => {
  const year = Number(yearOfBirth);
  if (!Number.isInteger(year) || year < 1900) return null;
  const age = now.getFullYear() - year;
  return age >= 0 && age <= 130 ? age : null;
};

export interface ConsumedAbha {
  abhaNumber: string | null;
  abhaAddress: string | null;
  name: string | null;
  gender: string | null;
  yearOfBirth: string | null;
}

/**
 * Hand over a verified enrolment, once.
 *
 * Returns null rather than throwing for every way this can legitimately come to
 * nothing — no such session, another clinic's, already used, too old. A
 * registration must not fail because the ABHA half of it did; the patient still
 * needs to be registered.
 *
 * Marked consumed in the same query that fetches it, so two registrations
 * racing on one txnId cannot both win.
 */
export const consumeAbhaSession = async (
  clinicId: string,
  txnId: string,
  now = new Date()
): Promise<ConsumedAbha | null> => {
  const session = await prisma.abhaEnrolmentSession.findUnique({ where: { txnId } });
  if (!session) return null;
  if (session.clinicId !== clinicId) return null;
  if (now.getTime() - session.createdAt.getTime() > SESSION_TTL_MS) return null;

  // The delete IS the claim. Two registrations racing on one txnId both read
  // the row, and only one of them removes it — and the personal fragment in it
  // is gone the moment it has been used, rather than kept as a spent marker.
  const claimed = await prisma.abhaEnrolmentSession.deleteMany({ where: { txnId } });
  if (claimed.count !== 1) return null;

  return {
    abhaNumber: session.abhaNumber,
    abhaAddress: session.abhaAddress,
    name: session.name,
    gender: session.gender,
    yearOfBirth: session.yearOfBirth
  };
};

/**
 * Put a consumed enrolment onto a patient.
 *
 * The Aadhaar record REPLACES what was typed into the form. That is the point
 * of having asked for it: a name and age the patient typed on a phone are a
 * guess, and the Aadhaar record is the thing ABDM checks a link against —
 * "AnkiT Rai, born 2004" was refused where "Ankit Kumar Rai, born 2002" was
 * accepted, for the same person.
 *
 * abhaVerified is true here and that is safe, unlike a value read from a
 * request: this ABHA came back from ABDM against an OTP that only the holder of
 * that Aadhaar's mobile could read.
 */
export const applyAbhaToPatient = async (
  clinicId: string,
  patientId: string,
  abha: ConsumedAbha
): Promise<void> => {
  const age = ageFromYearOfBirth(abha.yearOfBirth);

  await forClinic(clinicId).patient.update({
    where: { id: patientId },
    data: {
      ...(abha.abhaNumber ? { abhaNumber: abha.abhaNumber } : {}),
      ...(abha.abhaAddress ? { abhaAddress: abha.abhaAddress } : {}),
      abhaVerified: true,
      abhaLinkedAt: new Date(),
      // ABDM's own copy, kept beside the clinic's for linking.
      ...(abha.name ? { abdmName: abha.name } : {}),
      ...(abha.gender ? { abdmGender: abha.gender } : {}),
      ...(abha.yearOfBirth ? { abdmYearOfBirth: abha.yearOfBirth } : {}),
      // ...and the clinic's own record, overwritten from Aadhaar.
      ...(abha.name ? { name: abha.name } : {}),
      ...(abha.gender ? { gender: abha.gender } : {}),
      ...(age !== null ? { age } : {})
    }
  });
};

/**
 * Public registration, with an ABHA if the patient chose to prove one.
 *
 * Composed here rather than inside createPublicPatient so that core/ keeps
 * knowing nothing about ABDM: a clinic that never touches ABDM runs the same
 * registration, and the ABHA half is simply absent.
 *
 * The ABHA is applied AFTER the patient exists, and its failure is not allowed
 * to undo the registration. Someone standing at a front desk has registered
 * either way, and losing that because a government API was unwell would be the
 * worse outcome by far.
 */
export const registerPublicPatientWithAbha = async (
  clinicId: string,
  input: PublicRegisterPatientInput & { abhaTxnId?: string }
): Promise<PatientRecord> => {
  // Claimed BEFORE the patient is created, not after, and the ordering carries
  // weight: the record is written with the Aadhaar details from the start, and
  // the welcome message can name the ABHA. Doing it afterwards would create the
  // patient under the typed name, send them a message that does not mention
  // their new ABHA, and then quietly correct the row behind them.
  const abha = input.abhaTxnId ? await consumeAbhaSession(clinicId, input.abhaTxnId) : null;

  if (input.abhaTxnId && !abha) {
    // Expired, already used, or never verified. Not an error to the patient:
    // they are registered either way, and the alternative is refusing a
    // registration over the half of it that was optional.
    console.info(`[ABDM] registration quoted an unusable ABHA session for clinic ${clinicId}`);
  }

  const patient = await createPublicPatient(
    clinicId,
    abha
      ? {
          ...input,
          // The Aadhaar record wins over what was typed. That is what it was
          // asked for — and it is the version ABDM checks a link against.
          name: abha.name ?? input.name,
          gender: abha.gender ?? input.gender,
          age: ageFromYearOfBirth(abha.yearOfBirth) ?? input.age
        }
      : input,
    { abhaNumber: abha?.abhaNumber ?? null }
  );

  if (!abha) return patient;

  try {
    await applyAbhaToPatient(clinicId, patient.id, abha);
  } catch (err) {
    // The patient exists and has been welcomed; only the ABHA columns are
    // missing, and the desk can see that on their record.
    console.error('[ABDM] could not attach the ABHA to a new registration:', err);
    return patient;
  }

  const updated = await forClinic(clinicId).patient.findFirst({ where: { id: patient.id } });
  return (updated ?? patient) as PatientRecord;
};
