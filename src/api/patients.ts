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
}

export interface AbhaIdentity {
  id: string;
  name: string;
  abhaNumber: string | null;
  abhaAddress: string | null;
  abhaLinkedAt: string | null;
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
