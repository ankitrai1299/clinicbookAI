import { z } from 'zod';

export const patientIdParamsSchema = z.object({
  id: z.string().trim().min(1)
});

export const createPatientSchema = z.object({
  name: z.string().trim().min(2).max(150),
  phone: z.string().trim().min(6).max(30),
  language: z.string().trim().min(2).max(50)
});

export const updatePatientSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  phone: z.string().trim().min(6).max(30).optional(),
  language: z.string().trim().min(2).max(50).optional()
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field is required for update'
});

// Public, unauthenticated self-registration (from the shareable /register page).
// Patients supply a few extra intake details; clinic context comes from the URL.
export const publicRegisterPatientSchema = z.object({
  name: z.string().trim().min(2).max(150),
  phone: z.string().trim().min(6).max(30),
  age: z.coerce.number().int().min(0).max(120),
  gender: z.string().trim().min(1).max(30),
  healthConcern: z.string().trim().min(2).max(1000),
  /**
   * A completed Aadhaar OTP from this same page, if the patient chose to do one.
   *
   * The id ONLY. Everything about the ABHA is held on the server against it, so
   * this request can quote a verification but cannot assert one — a form that
   * could post `{ abhaNumber, verified: true }` would let anyone attach any
   * person's ABHA to any patient.
   */
  abhaTxnId: z.string().trim().min(6).max(120).optional()
});

/**
 * Aadhaar, on its way to UIDAI and nowhere else.
 *
 * Twelve digits is checked here rather than at ABDM, which answers every bad
 * value with the same opaque "Invalid LoginId" and would leave the patient
 * staring at a message that tells them nothing to fix.
 */
export const publicAbhaOtpSchema = z.object({
  aadhaar: z.string().trim().regex(/^\d{12}$/, 'An Aadhaar number is 12 digits.')
});

export const publicAbhaVerifySchema = z.object({
  txnId: z.string().trim().min(6).max(120),
  otp: z.string().trim().regex(/^\d{4,8}$/, 'The OTP is the number in the text message.'),
  /**
   * Optional, and ABDM's rule rather than ours: it wants the mobile to put on
   * the new ABHA. Left out, the Aadhaar-linked one is used.
   */
  mobile: z.string().trim().max(20).optional()
});

export const clinicIdParamsSchema = z.object({
  clinicId: z.string().trim().min(1)
});

// Public availability query (?doctorId=&date=YYYY-MM-DD) for the landing page.
export const publicAvailabilityQuerySchema = z.object({
  doctorId: z.string().trim().min(1),
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
});

// Public landing-page booking: minimal patient details + chosen doctor/slot.
export const publicBookingSchema = z.object({
  name: z.string().trim().min(2).max(150),
  phone: z.string().trim().min(6).max(30),
  language: z.string().trim().min(2).max(50).optional(),
  doctorId: z.string().trim().min(1),
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  time: z.string().trim().min(1).max(20)
});

export type CreatePatientInput = z.infer<typeof createPatientSchema>;
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;
export type PatientIdParams = z.infer<typeof patientIdParamsSchema>;
export type PublicRegisterPatientInput = z.infer<typeof publicRegisterPatientSchema>;
export type PublicAbhaOtpInput = z.infer<typeof publicAbhaOtpSchema>;
export type PublicAbhaVerifyInput = z.infer<typeof publicAbhaVerifySchema>;
export type ClinicIdParams = z.infer<typeof clinicIdParamsSchema>;
export type PublicAvailabilityQuery = z.infer<typeof publicAvailabilityQuerySchema>;
export type PublicBookingInput = z.infer<typeof publicBookingSchema>;