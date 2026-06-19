import { apiFetch } from './client';

export interface PublicClinic {
  id: string;
  name: string;
}

export interface PublicRegistrationInput {
  name: string;
  phone: string;
  age: number;
  gender: string;
  healthConcern: string;
}

export interface PublicRegistrationResult {
  id: string;
  name: string;
  phone: string;
}

// Public, unauthenticated endpoints backing the shareable /register page.
export const getPublicClinic = (clinicId: string) =>
  apiFetch<PublicClinic>(`/api/public/clinic/${encodeURIComponent(clinicId)}`);

export const registerPublicPatient = (clinicId: string, body: PublicRegistrationInput) =>
  apiFetch<PublicRegistrationResult>(`/api/public/clinic/${encodeURIComponent(clinicId)}/register`, {
    method: 'POST',
    body: JSON.stringify(body)
  });

export interface PublicDoctor {
  id: string;
  name: string;
  speciality: string;
}

export interface PublicAvailability {
  doctorId: string;
  date: string;
  slots: string[];
}

export interface PublicBookingInput {
  name: string;
  phone: string;
  language?: string;
  doctorId: string;
  date: string; // YYYY-MM-DD
  time: string; // e.g. "09:00 AM"
}

export interface PublicBookingResult {
  appointmentId: string;
  status: string;
  doctor: string;
  date: string;
  time: string;
  clinicName: string;
  patient: { id: string; name: string; phone: string; patientCode: string | null };
}

// Real doctors for the configured public clinic.
export const getPublicDoctors = (clinicId: string) =>
  apiFetch<PublicDoctor[]>(`/api/public/clinic/${encodeURIComponent(clinicId)}/doctors`);

// Real availability (open slots) for a doctor on a date.
export const getPublicAvailability = (clinicId: string, doctorId: string, date: string) =>
  apiFetch<PublicAvailability>(
    `/api/public/clinic/${encodeURIComponent(clinicId)}/availability` +
      `?doctorId=${encodeURIComponent(doctorId)}&date=${encodeURIComponent(date)}`
  );

// Create a real appointment (PENDING) from the landing page.
export const createPublicBooking = (clinicId: string, body: PublicBookingInput) =>
  apiFetch<PublicBookingResult>(`/api/public/clinic/${encodeURIComponent(clinicId)}/book`, {
    method: 'POST',
    body: JSON.stringify(body)
  });

export const PUBLIC_CLINIC_ID = (import.meta.env.VITE_PUBLIC_CLINIC_ID as string) ?? '';
