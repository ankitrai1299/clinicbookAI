// The clinic's ABDM registration, from ClinicBook.
//
// The endpoints live under /api/mediscribe/admin because that is where the
// registry service was first built, and moving a live route to make a menu
// tidier is a change with no benefit and a real risk. Both apps read the same
// `auth_token`, so the same session reaches them either way — which is exactly
// why the SCREEN could move without the API moving with it.

import { API_BASE } from './client';

/**
 * These endpoints answer with the object itself, not ClinicBook's
 * `{ success, data }` envelope — they were written on the scribe's side, which
 * has never used one.
 *
 * So `apiFetch` cannot be used: it unwraps `.data` and would hand back
 * `undefined`, which this screen reads as "nothing to show" and renders as a
 * blank page with no error anywhere. That is exactly what it did.
 *
 * A tiny fetch of its own is the honest fix. Making one convention pretend to
 * be the other would leave the next person to find this the same way.
 */
const abdmFetch = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const token = localStorage.getItem('auth_token');
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string; message?: string }).error ?? (body as { message?: string }).message ?? 'Request failed');
  }
  return body as T;
};

export interface ProfessionalRegistration {
  id: string;
  name: string;
  speciality: string | null;
  hprId: string | null;
}

export interface RegistryStatus {
  facility: { clinicName: string; hfrId: string | null };
  /**
   * Served by the API, never written here: the bridge id and the portal differ
   * between the ABDM sandbox and production, and a value hardcoded in the
   * frontend would be right in one and quietly wrong in the other.
   */
  linkage: { bridgeId: string | null; portalUrl: string; sandbox: boolean };
  doctors: ProfessionalRegistration[];
  complete: boolean;
}

export const getRegistryStatus = () => abdmFetch<RegistryStatus>('/api/mediscribe/admin/abdm');

export const saveFacilityId = (hfrId: string) =>
  abdmFetch<RegistryStatus>('/api/mediscribe/admin/abdm/facility', {
    method: 'PUT',
    body: JSON.stringify({ hfrId }),
  });

export const saveProfessionalId = (doctorId: string, hprId: string) =>
  abdmFetch<RegistryStatus>(`/api/mediscribe/admin/abdm/doctors/${doctorId}`, {
    method: 'PUT',
    body: JSON.stringify({ hprId }),
  });
