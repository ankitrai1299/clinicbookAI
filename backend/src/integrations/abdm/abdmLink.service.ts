// Pushing a clinic's visits into a patient's national health record — ABDM M2,
// the HIP-initiated linking flow.
//
// ── Why this is push, not answer-when-asked ────────────────────────────────
//
// The older v0.5 flow was discovery-driven: ABDM asked whether we knew a
// patient, we answered, and linking followed. V3 lets a HIP go first — we ask
// for a link token against the patient's ABHA address and then push their care
// contexts. That is a better fit here, because the clinic already knows exactly
// which visits happened; nothing has to be guessed from a description.
//
// ── The two-step handshake, and why it cannot be one call ──────────────────
//
//   1. POST /hiecm/api/v3/token/generate-token   → 202, and nothing else
//   2. ABDM calls OUR callback with the link token, seconds later
//   3. POST /hiecm/api/v3/link/carecontext       with that token
//
// Step 1 returns 202 and no token: the gateway answers asynchronously, on the
// callback URL registered against our bridge. So a link cannot be completed
// inside one request, and any code that expects it to will simply hang.
//
// ── Path convention ────────────────────────────────────────────────────────
//
// M2 lives at `/hiecm/api/v3/...`, NOT `/api/hiecm/...` — that second shape is
// the session and bridge APIs, and data-flow uses a third. All three were
// found by probing the live sandbox; the published documents disagree with each
// other about which is which.

import { AppError } from '../../utils/AppError.js';
import { abdmHeaders, getGatewayToken } from './abdmSession.js';
import { env } from '../../config/env.js';

import axios from 'axios';

const gateway = () => env.ABDM_GATEWAY_BASE_URL;

/**
 * PURE: ABDM wants a single letter. Our patients' gender is free text, typed by
 * whoever registered them.
 *
 * Anything unrecognised becomes 'O' rather than being refused. A link that
 * fails because someone wrote "Male " with a trailing space helps nobody, and
 * gender is not what identifies the patient here — the ABHA address is.
 */
export const abdmGender = (value: string | null | undefined): 'M' | 'F' | 'O' => {
  const g = String(value ?? '').trim().toLowerCase();
  if (g.startsWith('m')) return 'M';
  if (g.startsWith('f')) return 'F';
  return 'O';
};

/**
 * PURE: ABDM wants a four-digit year of birth; we store age, not a birth date.
 *
 * Derived rather than stored, and approximate by up to a year — which is what
 * an age in years can support. Out-of-range ages produce null so the caller can
 * refuse cleanly instead of sending a year ABDM rejects with a message about
 * the range.
 */
export const yearOfBirthFromAge = (age: number | null | undefined, now = new Date()): string | null => {
  if (typeof age !== 'number' || !Number.isFinite(age) || age < 0 || age > 130) return null;
  const year = now.getFullYear() - Math.floor(age);
  return year >= 1900 && year <= 2200 ? String(year) : null;
};

const headersFor = async (hipId: string): Promise<Record<string, string>> => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${await getGatewayToken()}`,
  ...abdmHeaders(),
  // Which facility this is about. Everything in M2 is scoped by it.
  'X-HIP-ID': hipId
});

export interface LinkTokenRequest {
  hipId: string;
  abhaAddress: string;
  name: string;
  gender: string | null;
  age: number | null;
}

/**
 * Ask ABDM for a link token for this patient.
 *
 * Returns nothing useful: the gateway answers 202 and delivers the token to our
 * callback URL a moment later. The caller's job is to have made this request;
 * the token arrives elsewhere.
 *
 * ABDM blocks a facility for 24 hours after three of these for the same ABHA
 * address in one day, so a caller MUST check for a stored token first.
 */
export const requestLinkToken = async (req: LinkTokenRequest): Promise<void> => {
  const yearOfBirth = yearOfBirthFromAge(req.age);
  if (!yearOfBirth) {
    throw new AppError(
      "This patient's age is not recorded, and ABDM needs a year of birth to link their records.",
      400
    );
  }

  try {
    await axios.post(
      `${gateway()}/hiecm/api/v3/token/generate-token`,
      {
        abhaAddress: req.abhaAddress,
        name: req.name,
        gender: abdmGender(req.gender),
        yearOfBirth
        // abhaNumber deliberately omitted. It is optional, and ABDM's own FAQ
        // says that sending it here forces it into the carecontext call too —
        // one more thing to keep consistent for no gain.
      },
      { headers: await headersFor(req.hipId), timeout: 30_000 }
    );
  } catch (err) {
    throw asAppError(err, 'Could not start linking with ABDM.');
  }
};

export interface CareContextToLink {
  /** Our appointment id. ABDM stores it and quotes it back when fetching data. */
  referenceNumber: string;
  /** What the patient sees in their health app. */
  display: string;
}

export interface LinkRequest {
  hipId: string;
  linkToken: string;
  abhaAddress: string;
  patientReference: string;
  patientDisplay: string;
  careContexts: CareContextToLink[];
  /** One of ABDM's HI types, e.g. OPConsultation. */
  hiType: string;
}

/**
 * Push the visits into the patient's record.
 *
 * Once linked, a care context CANNOT be unlinked or deleted — ABDM says so
 * plainly. So this is called only for visits that actually happened, and the
 * caller filters before it gets here.
 */
export const linkCareContexts = async (req: LinkRequest): Promise<void> => {
  if (!req.careContexts.length) return;

  try {
    await axios.post(
      `${gateway()}/hiecm/api/v3/link/carecontext`,
      {
        abhaAddress: req.abhaAddress,
        patient: [
          {
            referenceNumber: req.patientReference,
            display: req.patientDisplay,
            careContexts: req.careContexts,
            hiType: req.hiType,
            count: req.careContexts.length
          }
        ]
      },
      {
        headers: {
          ...(await headersFor(req.hipId)),
          // The token from the callback. Not the gateway token — that one is
          // still in Authorization, and the two are not interchangeable.
          'X-LINK-TOKEN': req.linkToken
        },
        timeout: 30_000
      }
    );
  } catch (err) {
    throw asAppError(err, 'Could not link the visits.');
  }
};

/** ABDM's errors arrive in three different shapes; this reads all of them. */
const asAppError = (err: unknown, fallback: string): AppError => {
  if (err instanceof AppError) return err;
  const res = (err as { response?: { status?: number; data?: unknown } })?.response;
  const data = res?.data;

  // An ARRAY of {error:{message}} is the commonest M2 shape, and the one a
  // single-object reader silently turns into "[object Object]".
  const list = Array.isArray(data) ? data : [data];
  const message = list
    .map((d) => (d as { error?: { message?: string }; message?: string } | null))
    .map((d) => d?.error?.message ?? d?.message)
    .filter(Boolean)
    .join('; ');

  return new AppError(message || fallback, res?.status && res.status < 500 ? res.status : 502);
};
