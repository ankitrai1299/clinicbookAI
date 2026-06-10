import { apiFetch } from './client';

export interface ApiWaitlistEntry {
  id: string;
  clinicId: string;
  patientId: string;
  priority: number;
  status: string;
  patient?: { id: string; name: string; phone: string; language: string };
}

export const getWaitlist = (status?: string) =>
  apiFetch<ApiWaitlistEntry[]>(`/api/waitlist${status ? `?status=${status}` : ''}`);

export const addToWaitlist = (body: { patientId: string; priority?: number }) =>
  apiFetch<ApiWaitlistEntry>('/api/waitlist', { method: 'POST', body: JSON.stringify(body) });

export const offerWaitlistSlot = (id: string) =>
  apiFetch<ApiWaitlistEntry>(`/api/waitlist/${id}/offer`, { method: 'PATCH' });

export const cancelWaitlistEntry = (id: string) =>
  apiFetch<ApiWaitlistEntry>(`/api/waitlist/${id}/cancel`, { method: 'PATCH' });
