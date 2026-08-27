// Creating an ABHA for a patient who has none, and putting it on their record.
//
// ── Why this sits in services/ and not in the patients controller ──────────
//
// It composes two layers that must not know about each other: the ABDM
// integration (integrations/abdm) and a clinic's patient record (core). The
// architecture test enforces that core never imports an integration — and it
// caught this being wired the wrong way round. That rule is what keeps ABDM an
// optional plug-in rather than something the patient module depends on: a
// clinic that never touches ABDM must not carry it.
//
// So the controller calls only this, and this reaches both ways.

import { enrolByAadhaar, requestAadhaarOtp } from '../integrations/abdm/abdmEnrolment.service.js';
import { setPatientAbha, type PatientAbha } from './abdmIdentity.service.js';
import { AppError } from '../utils/AppError.js';

export interface EnrolmentStarted {
  /** Carries the session to the verify step. Not derived from the Aadhaar. */
  txnId: string;
  message?: string;
}

/**
 * Step one: ABDM texts an OTP to the mobile registered against this Aadhaar.
 *
 * The Aadhaar number passes through and is dropped — see the note at the top of
 * integrations/abdm/abdmEnrolment.service.ts. Nothing here stores or logs it.
 */
export const startAbhaEnrolment = async (aadhaar: string): Promise<EnrolmentStarted> => {
  const started = await requestAadhaarOtp(aadhaar);
  return { txnId: started.txnId, message: started.message };
};

export interface EnrolmentFinished extends PatientAbha {
  /** ABDM found an existing ABHA instead of minting one. Worth telling the desk. */
  alreadyExisted: boolean;
}

/**
 * Step two: the patient reads out the OTP, and the resulting ABHA lands on
 * their record.
 *
 * Written through setPatientAbha rather than a direct update, so the duplicate
 * check applies to a created ABHA exactly as it does to a typed one. That is
 * not a formality here: if the ABHA comes back already sitting on another
 * patient at this clinic, it means the person is registered twice, and the
 * refusal names the other record — which is the most useful thing anyone could
 * be told at that moment.
 */
export const finishAbhaEnrolment = async (
  clinicId: string,
  patientId: string,
  txnId: string,
  otp: string,
  mobile: string
): Promise<EnrolmentFinished> => {
  const created = await enrolByAadhaar(txnId, otp, mobile);

  if (!created.abhaNumber && !created.abhaAddress) {
    throw new AppError('ABDM completed the enrolment but returned no ABHA.', 502);
  }

  const patient = await setPatientAbha(clinicId, patientId, {
    ...(created.abhaNumber ? { abhaNumber: created.abhaNumber } : {}),
    ...(created.abhaAddress ? { abhaAddress: created.abhaAddress } : {})
  });

  return { ...patient, alreadyExisted: created.alreadyExisted };
};
