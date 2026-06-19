// Doctor Portal API client. Deliberately self-contained and uses its OWN token
// key ('doctor_token') so a logged-in doctor and a logged-in admin never clash
// in the same browser. The Admin dashboard keeps using 'auth_token' untouched.
import { API_BASE, ApiError } from './client';

const TOKEN_KEY = 'doctor_token';

export const getDoctorToken = () => localStorage.getItem(TOKEN_KEY);
export const setDoctorToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearDoctorToken = () => localStorage.removeItem(TOKEN_KEY);

async function dfetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getDoctorToken();
  const res = await fetch(`${API_BASE}/api/doctor-portal${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {})
    }
  });
  const json = await res.json().catch(() => ({ message: 'Unexpected server error' }));
  if (!res.ok) {
    throw new ApiError(res.status, (json as { message?: string }).message ?? res.statusText);
  }
  return (json as { data: T }).data;
}

export interface DoctorAccount {
  id: string;
  clinicId: string;
  name: string;
  speciality: string;
  email: string | null;
  phone: string | null;
}

export interface DoctorAuthResult {
  doctor: DoctorAccount;
  accessToken: string;
}

export interface DoctorSchedule {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
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

export interface DoctorLeave {
  id: string;
  startDate: string;
  endDate: string;
  reason: string | null;
}

export interface DoctorAppointment {
  id: string;
  appointmentDate: string;
  appointmentTime: string;
  status: string;
  patient: { id: string; name: string; phone: string } | null;
}

export interface DoctorPatient {
  id: string;
  name: string;
  phone: string;
  language: string;
  age: number | null;
  gender: string | null;
  patientCode: string | null;
  createdAt: string;
}

// --- Auth ---
export const registerDoctor = (body: {
  name: string;
  speciality: string;
  email: string;
  phone: string;
  password: string;
}) => dfetch<DoctorAuthResult>('/auth/register', { method: 'POST', body: JSON.stringify(body) });

export const loginDoctor = (body: { email: string; password: string }) =>
  dfetch<DoctorAuthResult>('/auth/login', { method: 'POST', body: JSON.stringify(body) });

export const getDoctorMe = () => dfetch<DoctorAccount>('/me');

// --- Schedule ---
export const getMySchedule = () => dfetch<DoctorSchedule[]>('/schedule');
export const setMySchedule = (entries: ScheduleEntryInput[]) =>
  dfetch<DoctorSchedule[]>('/schedule', { method: 'PUT', body: JSON.stringify({ entries }) });

// --- Leaves ---
export const getMyLeaves = () => dfetch<DoctorLeave[]>('/leaves');
export const addMyLeave = (body: { startDate: string; endDate: string; reason?: string }) =>
  dfetch<DoctorLeave>('/leaves', { method: 'POST', body: JSON.stringify(body) });
export const deleteMyLeave = (leaveId: string) =>
  dfetch<void>(`/leaves/${leaveId}`, { method: 'DELETE' });

// --- Appointments ---
export const getMyAppointments = (status?: string) =>
  dfetch<DoctorAppointment[]>(`/appointments${status ? `?status=${status}` : ''}`);

export const decideAppointment = (
  id: string,
  body: { action: 'approve' | 'reject' | 'reschedule'; appointmentDate?: string; appointmentTime?: string }
) => dfetch<DoctorAppointment>(`/appointments/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

// --- Patients ---
export const getMyPatients = () => dfetch<DoctorPatient[]>('/patients');
