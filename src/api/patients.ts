import { apiFetch, API_BASE } from './client';

export interface ApiPatient {
  id: string;
  clinicId: string;
  name: string;
  phone: string;
  language: string;
  age?: number | null;
  gender?: string | null;
  healthConcern?: string | null;
  source?: string | null;
  /**
   * The patient's ABHA — their national health identity.
   *
   * Null for most patients, and that is the normal state, not missing data:
   * having an ABHA is a deliberate act by the patient, and everything here has
   * to keep working for the ones who never take it.
   */
  abhaNumber?: string | null;
  abhaAddress?: string | null;
  abhaLinkedAt?: string | null;
  /**
   * Has anyone CHECKED this ABHA belongs to this patient?
   *
   * False when the patient typed it at us over WhatsApp, where nothing proves
   * it is theirs. ABDM discovery ignores unverified ids, so until the desk
   * confirms it against the card it does nothing at all — which is why the
   * dashboard has to show the difference.
   */
  abhaVerified?: boolean;
}

export interface AbhaIdentity {
  id: string;
  name: string;
  abhaNumber: string | null;
  abhaAddress: string | null;
  abhaLinkedAt: string | null;
  abhaVerified: boolean;
}

/**
 * Record or clear a patient's ABHA. Sending an empty string CLEARS that field —
 * an identity typed onto the wrong patient has to be removable, and no format
 * check can catch "right format, wrong person".
 */
export const setPatientAbha = (
  id: string,
  body: { abhaNumber?: string; abhaAddress?: string }
) =>
  apiFetch<AbhaIdentity>(`/api/patients/${id}/abha`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

export const getPatients = () => apiFetch<ApiPatient[]>('/api/patients');

export const createPatient = (body: { name: string; phone: string; language: string }) =>
  apiFetch<ApiPatient>('/api/patients', { method: 'POST', body: JSON.stringify(body) });

/**
 * Create an ABHA for a patient who has none (ABDM Milestone M1).
 *
 * Two calls, because the patient reads an OTP off their own phone in between.
 * The Aadhaar number goes to the server, on to ABDM encrypted, and is never
 * stored — not here, not there. Nothing derived from it comes back.
 */
export const startAbhaEnrolment = (id: string, aadhaar: string) =>
  apiFetch<{ txnId: string; message?: string }>(`/api/patients/${id}/abha/enrol`, {
    method: 'POST',
    body: JSON.stringify({ aadhaar }),
  });

export interface EnrolmentResult extends AbhaIdentity {
  alreadyExisted: boolean;
  /**
   * Carry the enrolment session into the two steps that follow. Held only for
   * the length of this flow — nothing stores them, here or on the server.
   */
  txnId: string | null;
  abhaToken: string | null;
  /** Readable addresses ABDM offers for this patient. */
  suggestions: string[];
}

export const finishAbhaEnrolment = (
  id: string,
  body: { txnId: string; otp: string; mobile: string }
) =>
  apiFetch<EnrolmentResult>(`/api/patients/${id}/abha/enrol/verify`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

/** Claim a readable ABHA address, e.g. `asha.verma` — ABDM appends the rest. */
export const claimAbhaAddress = (id: string, body: { txnId: string; abhaAddress: string }) =>
  apiFetch<AbhaIdentity>(`/api/patients/${id}/abha/address`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

/**
 * The patient's ABHA card as an image.
 *
 * Uses fetch directly rather than apiFetch, which expects JSON — this returns
 * bytes. The token goes in the body, not the URL, so it stays out of logs.
 */
export const fetchAbhaCard = async (id: string, abhaToken: string): Promise<Blob> => {
  const token = localStorage.getItem('auth_token');
  const res = await fetch(`${API_BASE}/api/patients/${id}/abha/card`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ abhaToken }),
  });
  if (!res.ok) throw new Error('Could not download the ABHA card.');
  return res.blob();
};
