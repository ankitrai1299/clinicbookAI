import { apiFetch } from './client';

export interface ApiDoctor {
  id: string;
  clinicId: string;
  name: string;
  speciality: string;
}

export const getDoctors = () => apiFetch<ApiDoctor[]>('/api/doctors');

export const createDoctor = (body: { name: string; speciality: string }) =>
  apiFetch<ApiDoctor>('/api/doctors', { method: 'POST', body: JSON.stringify(body) });
