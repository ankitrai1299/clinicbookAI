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
  /**
   * A completed Aadhaar check from this same page, if the patient did one.
   *
   * The id and nothing else. The server holds what the OTP proved and reads it
   * back against this — the browser is never given the ABHA to post, because a
   * form that could say "this ABHA is verified" would let anyone attach any
   * person's identity to any patient.
   */
  abhaTxnId?: string;
  /**
   * Who is consenting, when the patient is under eighteen.
   *
   * India's DPDP Act makes a child's consent the parent's to give, so a
   * registration for someone under 18 is refused without these.
   */
  guardianName?: string;
  guardianRelation?: 'mother' | 'father' | 'guardian';
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

// ── ABHA, done by the patient ──────────────────────────────────────────────

export interface PublicAbhaOtpResult {
  txnId: string;
  /** ABDM's own wording, which names the masked mobile the OTP went to. */
  message?: string;
}

export interface PublicAbhaVerifyResult {
  txnId: string;
  abhaNumber: string | null;
  abhaAddress: string | null;
  /** True when ABDM already had one — nothing new was created. */
  alreadyExisted: boolean;
  /**
   * The Aadhaar record's own details, so the form can show what it will save.
   * The server fills the patient record from its own copy, not from these.
   */
  name?: string;
  gender?: string;
  yearOfBirth?: string;
}

/**
 * Ask ABDM to text an OTP to the mobile registered against this Aadhaar.
 *
 * Heavily rate-limited on the server: this reaches UIDAI and texts a real
 * person, so it is not something to retry in a loop.
 */
export const startPublicAbhaOtp = (clinicId: string, aadhaar: string) =>
  apiFetch<PublicAbhaOtpResult>(`/api/public/clinic/${encodeURIComponent(clinicId)}/abha/otp`, {
    method: 'POST',
    body: JSON.stringify({ aadhaar })
  });

export const verifyPublicAbhaOtp = (
  clinicId: string,
  body: { txnId: string; otp: string; mobile?: string }
) =>
  apiFetch<PublicAbhaVerifyResult>(`/api/public/clinic/${encodeURIComponent(clinicId)}/abha/verify`, {
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
