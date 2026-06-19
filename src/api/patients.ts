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
}

export const getPatients = () => apiFetch<ApiPatient[]>('/api/patients');

export const createPatient = (body: { name: string; phone: string; language: string }) =>
  apiFetch<ApiPatient>('/api/patients', { method: 'POST', body: JSON.stringify(body) });
