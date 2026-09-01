import { apiFetch } from './client';

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

export const finishAbhaEnrolment = (
  id: string,
  body: { txnId: string; otp: string; mobile: string }
) =>
  apiFetch<AbhaIdentity & { alreadyExisted: boolean }>(`/api/patients/${id}/abha/enrol/verify`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
