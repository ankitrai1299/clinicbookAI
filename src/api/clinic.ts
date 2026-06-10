import { apiFetch } from './client';

export interface ApiClinic {
  id: string;
  name: string;
  email: string;
  phone: string;
  plan: string;
}

export const getMyClinic = () => apiFetch<ApiClinic>('/api/clinics/me');
