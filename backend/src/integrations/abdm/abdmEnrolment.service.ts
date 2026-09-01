// Creating an ABHA for a patient who does not have one — ABDM Milestone M1.
//
// ── Aadhaar is never stored. Not once, not hashed, not in a log. ───────────
//
// This is the single most important rule in this file, and it is a legal one as
// much as an engineering one: under the Aadhaar Act a body like this clinic
// platform has no business retaining Aadhaar numbers. So the number arrives in
// one request, is encrypted with ABDM's public key, is sent, and goes out of
// scope. Nothing writes it to a column, an audit row, or a console line.
//
// The functions below take it as a plain argument and never return it. If a
// future change needs to "keep it for the next step" — it does not: ABDM hands
// back a txnId for exactly that purpose, and that is what gets carried.
//
// ── Why a different host from everything else ──────────────────────────────
//
// The gateway (sessions, bridges, HIP callbacks) is dev.abdm.gov.in. The ABHA
// enrolment APIs live on abhasbx.abdm.gov.in and are a separate product behind
// the same token. That distinction is load-bearing right now: our client has no
// subscription on the gateway APIs (every one answers 900908) but full access
// to these, which is why ABHA creation can be built and used while the HIP
// linking flow waits on NHA.
//
// ── The patient has to be standing there ───────────────────────────────────
//
// The OTP goes to the mobile registered against their Aadhaar, and nobody else
// can read it. This is not a form the desk can fill in from a photocopy, and
// the UI must not pretend otherwise.

import { randomUUID, publicEncrypt, constants } from 'node:crypto';

import axios from 'axios';

import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { getGatewayToken } from './abdmSession.js';

/** Sandbox ABHA host. Production is a different one, hence a variable. */
const abhaBase = () => env.ABDM_ABHA_BASE_URL;

const headers = async (): Promise<Record<string, string>> => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${await getGatewayToken()}`,
  'REQUEST-ID': randomUUID(),
  TIMESTAMP: new Date().toISOString().replace(/\.\d{3}Z$/, '.000Z'),
  'X-CM-ID': env.ABDM_CM_ID
});

// ── Public key ─────────────────────────────────────────────────────────────

interface CachedKey {
  pem: string;
  fetchedAt: number;
}
let cachedKey: CachedKey | null = null;

/** ABDM rotates this rarely; an hour keeps us current without a call per OTP. */
const KEY_TTL_MS = 60 * 60_000;

/** PURE: ABDM returns bare base64; RSA needs it wrapped and line-wrapped. */
export const toPem = (base64: string): string =>
  `-----BEGIN PUBLIC KEY-----\n${(base64.match(/.{1,64}/g) ?? []).join('\n')}\n-----END PUBLIC KEY-----`;

const publicKeyPem = async (now = Date.now()): Promise<string> => {
  if (cachedKey && now - cachedKey.fetchedAt < KEY_TTL_MS) return cachedKey.pem;
  const { data } = await axios.get(`${abhaBase()}/abha/api/v3/profile/public/certificate`, {
    headers: await headers(),
    timeout: 20_000
  });
  if (!data?.publicKey) throw new AppError('ABDM did not return a public key', 502);
  cachedKey = { pem: toPem(data.publicKey), fetchedAt: now };
  return cachedKey.pem;
};

/**
 * Encrypt a secret for ABDM.
 *
 * PKCS#1 v1.5 — verified against the live sandbox as the padding it accepts.
 * Used for the Aadhaar number and for the OTP; both are secrets that must not
 * cross the wire in the clear.
 */
const encryptForAbdm = async (value: string): Promise<string> =>
  publicEncrypt(
    { key: await publicKeyPem(), padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(value)
  ).toString('base64');

// ── Step 1: send the OTP ───────────────────────────────────────────────────

export interface OtpSent {
  /** Carries the session to the next step. NOT the Aadhaar number. */
  txnId: string;
  /** Masked by ABDM, e.g. "xxxxxxx890" — safe to show the patient. */
  mobileHint?: string;
  message?: string;
}

/**
 * Ask ABDM to text an OTP to the mobile registered against this Aadhaar.
 *
 * `aadhaar` is used and discarded. It is not returned, stored or logged.
 */
export const requestAadhaarOtp = async (aadhaar: string): Promise<OtpSent> => {
  const digits = aadhaar.replace(/\D/g, '');
  // Refused here rather than at ABDM, which answers every bad value with the
  // same opaque "Invalid LoginId" and would leave the desk with nothing to fix.
  if (digits.length !== 12) {
    throw new AppError('An Aadhaar number is 12 digits.', 400);
  }

  try {
    const { data } = await axios.post(
      `${abhaBase()}/abha/api/v3/enrollment/request/otp`,
      {
        txnId: '',
        scope: ['abha-enrol'],
        loginHint: 'aadhaar',
        otpSystem: 'aadhaar',
        loginId: await encryptForAbdm(digits)
      },
      { headers: await headers(), timeout: 30_000 }
    );
    if (!data?.txnId) throw new AppError('ABDM did not start an enrolment session', 502);
    return { txnId: data.txnId, mobileHint: data.message, message: data.message };
  } catch (err) {
    throw asAppError(err, 'Could not send the OTP.');
  }
};

// ── Step 2: verify the OTP, and the ABHA exists ────────────────────────────

export interface AbhaCreated {
  abhaNumber: string | null;
  abhaAddress: string | null;
  name?: string;
  gender?: string;
  /** True when ABDM found an existing ABHA rather than minting a new one. */
  alreadyExisted: boolean;
}

/**
 * Complete enrolment with the OTP the patient just received.
 *
 * `mobile` is the number the patient wants ABDM to contact them on, which is
 * often NOT the Aadhaar-linked one — a detail worth surfacing in the UI, since
 * a desk will otherwise assume the OTP number is the answer.
 */
export const enrolByAadhaar = async (
  txnId: string,
  otp: string,
  mobile: string
): Promise<AbhaCreated> => {
  try {
    const { data } = await axios.post(
      `${abhaBase()}/abha/api/v3/enrollment/enrol/byAadhaar`,
      {
        authData: {
          authMethods: ['otp'],
          // Exactly the fields NHA's own Postman collection sends. An earlier
          // version added a timeStamp here; it is not in the contract, and a
          // field ABDM does not expect is not worth the risk of a rejection
          // whose only message would be an opaque "Invalid ...".
          otp: {
            txnId,
            otpValue: await encryptForAbdm(otp),
            mobile: mobile.replace(/\D/g, '').slice(-10)
          }
        },
        consent: {
          // ABDM requires the consent flag on every enrolment. The words the
          // patient agreed to are shown on screen before this is ever called —
          // a `true` sent without that would be a lie told to a government API.
          code: 'abha-enrollment',
          version: '1.4'
        }
      },
      { headers: await headers(), timeout: 30_000 }
    );

    const profile = data?.ABHAProfile ?? data?.abhaProfile ?? {};
    return {
      abhaNumber: profile.ABHANumber ?? profile.abhaNumber ?? null,
      abhaAddress: profile.phrAddress?.[0] ?? profile.abhaAddress ?? null,
      name: [profile.firstName, profile.middleName, profile.lastName].filter(Boolean).join(' ') || undefined,
      gender: profile.gender,
      alreadyExisted: Boolean(data?.isNew === false)
    };
  } catch (err) {
    throw asAppError(err, 'Could not complete the ABHA enrolment.');
  }
};

/**
 * Turn an axios failure into something a front desk can act on.
 *
 * ABDM's own message is preferred when there is one — "OTP expired" tells the
 * desk to start again, where a generic failure tells them nothing. The status
 * is carried through so a 400 does not surface to the clinic as our outage.
 */
const asAppError = (err: unknown, fallback: string): AppError => {
  if (err instanceof AppError) return err;
  const res = (err as { response?: { status?: number; data?: Record<string, unknown> } })?.response;
  const body = res?.data ?? {};

  // The shape ABDM uses for the error a desk will actually hit — a wrong or
  // expired OTP:
  //   422 { "error": { "code": "ABDM-1204",
  //                    "message": "UIDAI Error code : 400 : Invalid Aadhaar OTP value." } }
  // Read FIRST, because without it that arrives as a generic failure and the
  // desk is told nothing about the one thing they can fix by retyping.
  const nested = (body as { error?: { message?: string } }).error?.message;
  if (typeof nested === 'string' && nested) {
    return new AppError(nested, res?.status && res.status < 500 ? res.status : 502);
  }

  const message =
    (typeof body.message === 'string' && body.message) ||
    (typeof body.details === 'string' && body.details) ||
    (Array.isArray(body.details) && typeof body.details[0]?.message === 'string' && body.details[0].message) ||
    // Field-level validation comes back as { fieldName: "Invalid ..." }.
    Object.entries(body)
      .filter(([k, v]) => k !== 'timestamp' && typeof v === 'string')
      .map(([, v]) => v)
      .join('; ');
  return new AppError(message || fallback, res?.status && res.status < 500 ? res.status : 502);
};
