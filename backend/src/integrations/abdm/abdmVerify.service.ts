// Proving that an ABHA belongs to the patient in front of you.
//
// ── Why an ABHA the desk typed is worth nothing on its own ─────────────────
//
// Fourteen digits is the only thing we can check without asking ABDM, and any
// fourteen digits pass. So an ABHA typed at a desk, or sent by a patient over
// WhatsApp, is stored UNVERIFIED and does nothing: linking refuses it, and
// discovery ignores it. That is deliberate — pushing a clinic's records against
// an unproven ABHA would write this patient's visits into whoever the address
// really belongs to, permanently.
//
// This is how that ABHA becomes usable.
//
// ── One flow, not two ──────────────────────────────────────────────────────
//
// It is tempting to want a quiet "does this ABHA exist?" check before bothering
// anybody with an OTP. ABDM does not offer one: the request that reveals whether
// an ABHA exists is the request that SENDS the OTP. A wrong number is refused
// before anything is sent (404 ABDM-1114 "User not found", confirmed against the
// live sandbox), and a right one costs the patient a text. That is the whole
// choice available.
//
// ── The OTP goes to the patient, and only they can read it ─────────────────
//
// `aadhaar-verify` sends it to the mobile on the ABHA's own Aadhaar record. The
// desk cannot receive it, cannot guess it, and cannot complete this without the
// patient. That is what makes the resulting `abhaVerified` mean something.

import axios from 'axios';

import { abhaBase, abhaHeaders, asAppError, encryptForAbdm, yearOfBirthFromProfile } from './abdmEnrolment.service.js';
import { AppError } from '../../utils/AppError.js';

/**
 * What ABDM is being asked for.
 *
 * `abha-login` says we want to authenticate against an existing ABHA;
 * `aadhaar-verify` says the OTP should go to the Aadhaar-linked mobile. Sending
 * this pair with `otpSystem: 'aadhaar'` is what the sandbox accepts — the same
 * call with `mobile-verify` is refused with "Invalid Otp System", so the two
 * halves are not independently chosen.
 */
const SCOPE = ['abha-login', 'aadhaar-verify'];

export interface AbhaOtpSent {
  txnId: string;
  /** ABDM's own wording, e.g. which mobile it went to, masked. */
  message?: string;
}

/**
 * Ask ABDM to text the holder of this ABHA.
 *
 * Throws a 404 when no such ABHA exists — which is the useful half of this call
 * even when nobody intends to finish, because it catches a mistyped number
 * before it can sit on a patient record looking plausible.
 */
export const requestAbhaLoginOtp = async (abhaNumber: string): Promise<AbhaOtpSent> => {
  const digits = abhaNumber.replace(/\D/g, '');
  if (digits.length !== 14) {
    throw new AppError('An ABHA number is 14 digits.', 400);
  }

  try {
    const { data } = await axios.post(
      `${abhaBase()}/abha/api/v3/profile/login/request/otp`,
      {
        scope: SCOPE,
        loginHint: 'abha-number',
        loginId: await encryptForAbdm(digits),
        otpSystem: 'aadhaar'
      },
      { headers: await abhaHeaders(), timeout: 30_000 }
    );

    if (!data?.txnId) throw new AppError('ABDM did not start a verification session.', 502);
    return { txnId: data.txnId, message: data.message };
  } catch (err) {
    // ABDM-1114 is "User not found", and it is worth saying plainly: the desk
    // can fix a wrong number by reading the card again, and nothing else about
    // this failure is theirs to act on.
    const code = (err as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error?.code;
    if (code === 'ABDM-1114') {
      throw new AppError('ABDM has no record of that ABHA number. Check it against the card.', 404);
    }
    throw asAppError(err, 'Could not start ABHA verification.');
  }
};

export interface AbhaIdentity {
  abhaNumber: string | null;
  abhaAddress: string | null;
  name?: string;
  gender?: string;
  yearOfBirth?: string;
}

/**
 * Finish with the OTP the patient just read out.
 *
 * Returns ABDM's own version of who this is. That is not a bonus: linking sends
 * a name, gender and year of birth to be checked against the Aadhaar record,
 * and a name typed at a front desk is not that record. Without this, a verified
 * ABHA would still fail to link for a patient whose ABHA we did not create.
 */
export const verifyAbhaLoginOtp = async (txnId: string, otp: string): Promise<AbhaIdentity> => {
  try {
    const { data } = await axios.post(
      `${abhaBase()}/abha/api/v3/profile/login/verify`,
      {
        scope: SCOPE,
        authData: {
          authMethods: ['otp'],
          otp: { txnId, otpValue: await encryptForAbdm(otp) }
        }
      },
      { headers: await abhaHeaders(), timeout: 30_000 }
    );

    // ABDM returns the matching accounts; one ABHA number yields one. The shapes
    // vary between responses in this API, so each is read where it has been
    // seen rather than assumed.
    const account = (data?.accounts?.[0] ?? data?.ABHAProfile ?? data?.abhaProfile ?? {}) as Record<string, unknown>;

    const name =
      (account.name as string | undefined) ||
      [account.firstName, account.middleName, account.lastName].filter(Boolean).join(' ') ||
      undefined;

    return {
      abhaNumber: (account.ABHANumber ?? account.abhaNumber ?? null) as string | null,
      abhaAddress: (account.preferredAbhaAddress ??
        (account.phrAddress as string[] | undefined)?.[0] ??
        account.abhaAddress ??
        null) as string | null,
      name,
      gender: account.gender as string | undefined,
      yearOfBirth: yearOfBirthFromProfile(account)
    };
  } catch (err) {
    throw asAppError(err, 'Could not verify the ABHA.');
  }
};
