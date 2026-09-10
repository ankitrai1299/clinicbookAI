// The clinic's ABDM registration, from ClinicBook.
//
// The endpoints live under /api/mediscribe/admin because that is where the
// registry service was first built, and moving a live route to make a menu
// tidier is a change with no benefit and a real risk. Both apps read the same
// `auth_token`, so the same session reaches them either way — which is exactly
// why the SCREEN could move without the API moving with it.

import { apiFetch } from './client';

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

export const getRegistryStatus = () => apiFetch<RegistryStatus>('/api/mediscribe/admin/abdm');

export const saveFacilityId = (hfrId: string) =>
  apiFetch<RegistryStatus>('/api/mediscribe/admin/abdm/facility', {
    method: 'PUT',
    body: JSON.stringify({ hfrId }),
  });

export const saveProfessionalId = (doctorId: string, hprId: string) =>
  apiFetch<RegistryStatus>(`/api/mediscribe/admin/abdm/doctors/${doctorId}`, {
    method: 'PUT',
    body: JSON.stringify({ hprId }),
  });
