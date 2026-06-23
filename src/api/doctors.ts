import { apiFetch } from './client';

export interface ApiDoctor {
  id: string;
  clinicId: string;
  name: string;
  speciality: string;
  experienceYears?: number | null;
  email?: string | null;
  phone?: string | null;
}

export interface DoctorInput {
  name: string;
  speciality: string;
  experienceYears?: number | null;
  email?: string;
  phone?: string;
}

export interface ApiSchedule {
  id: string;
  dayOfWeek: number; // 0=Sun … 6=Sat
  startTime: string; // "09:00"
  endTime: string; // "17:00"
  slotMinutes: number;
  isActive: boolean;
}

export interface ScheduleEntryInput {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotMinutes: number;
  isActive: boolean;
}

export interface ApiLeave {
  id: string;
  startDate: string;
  endDate: string;
  reason: string | null;
}

export interface ApiDoctorAppointment {
  id: string;
  appointmentDate: string;
  appointmentTime: string;
  status: string;
  patient: { id: string; name: string; phone: string } | null;
}

export const getDoctors = () => apiFetch<ApiDoctor[]>('/api/doctors');

export const createDoctor = (body: DoctorInput) =>
  apiFetch<ApiDoctor>('/api/doctors', { method: 'POST', body: JSON.stringify(body) });

export const updateDoctor = (id: string, body: Partial<DoctorInput>) =>
  apiFetch<ApiDoctor>(`/api/doctors/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteDoctor = (id: string) =>
  apiFetch<void>(`/api/doctors/${id}`, { method: 'DELETE' });

// --- Schedule ---
export const getDoctorSchedule = (id: string) =>
  apiFetch<ApiSchedule[]>(`/api/doctors/${id}/schedule`);

export const setDoctorSchedule = (id: string, entries: ScheduleEntryInput[]) =>
  apiFetch<ApiSchedule[]>(`/api/doctors/${id}/schedule`, {
    method: 'PUT',
    body: JSON.stringify({ entries })
  });

// --- Leaves ---
export const getDoctorLeaves = (id: string) => apiFetch<ApiLeave[]>(`/api/doctors/${id}/leaves`);

export const addDoctorLeave = (id: string, body: { startDate: string; endDate: string; reason?: string }) =>
  apiFetch<ApiLeave>(`/api/doctors/${id}/leaves`, { method: 'POST', body: JSON.stringify(body) });

export const deleteDoctorLeave = (id: string, leaveId: string) =>
  apiFetch<void>(`/api/doctors/${id}/leaves/${leaveId}`, { method: 'DELETE' });

// --- Appointments ---
export const getDoctorAppointments = (id: string) =>
  apiFetch<ApiDoctorAppointment[]>(`/api/doctors/${id}/appointments`);
