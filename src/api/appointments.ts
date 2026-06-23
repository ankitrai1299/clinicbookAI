import { apiFetch } from './client';

export interface ApiAppointment {
  id: string;
  clinicId: string;
  doctorId: string;
  patientId: string;
  appointmentDate: string;
  appointmentTime: string;
  status: string;
  completedAt?: string | null;
  completedBy?: string | null;
  doctor?: { id: string; name: string; speciality: string };
  patient?: { id: string; name: string; phone: string; language: string };
}

export const getAppointments = () => apiFetch<ApiAppointment[]>('/api/appointments');

export const createAppointment = (body: {
  doctorId: string;
  patientId: string;
  appointmentDate: string;
  appointmentTime: string;
}) =>
  apiFetch<ApiAppointment>('/api/appointments', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const patchAppointment = (id: string, status: string) =>
  apiFetch<ApiAppointment>(`/api/appointments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });

// Dedicated completion endpoint: validates CONFIRMED → COMPLETED server-side and
// triggers the post-visit workflow (thank-you WhatsApp + audit timestamp).
export const completeAppointment = (id: string) =>
  apiFetch<ApiAppointment>(`/api/appointments/${id}/complete`, {
    method: 'PATCH',
  });
