import { apiFetch } from './client';

export interface ApiAppointment {
  id: string;
  clinicId: string;
  doctorId: string;
  patientId: string;
  appointmentDate: string;
  appointmentTime: string;
  status: string;
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
