import { apiFetch } from './client';

export interface ApiClinic {
  id: string;
  name: string;
  email: string;
  phone: string;
  plan: string;
  stripeCustomerId?: string;
}

export const getMyClinic = () => apiFetch<ApiClinic>('/api/clinics/me');

export const updateMyClinic = (body: { name?: string; phone?: string }) =>
  apiFetch<ApiClinic>('/api/clinics/me', { method: 'PATCH', body: JSON.stringify(body) });
