import { Request, Response } from 'express';

import { asyncHandler } from '../../utils/asyncHandler.js';
import { getAvailableSlots } from '../../services/scheduling.service.js';
import {
  ClinicIdParams,
  PublicAvailabilityQuery,
  PublicAbhaOtpInput,
  PublicAbhaVerifyInput,
  PublicBookingInput,
  PublicRegisterPatientInput
} from './patient.schemas.js';
import {
  createPublicBooking,
  getPublicClinicInfo,
  getPublicDoctors
} from './patient.service.js';
import {
  registerPublicPatientWithAbha,
  startPublicAbhaOtp,
  verifyPublicAbhaOtp
} from '../../services/publicAbhaEnrolment.service.js';

export const getPublicClinicHandler = asyncHandler(async (req: Request, res: Response) => {
  const { clinicId } = req.params as ClinicIdParams;
  const clinic = await getPublicClinicInfo(clinicId);

  res.status(200).json({
    success: true,
    data: clinic
  });
});

export const registerPublicPatientHandler = asyncHandler(async (req: Request, res: Response) => {
  const { clinicId } = req.params as ClinicIdParams;
  // Composed in services/ so core/ keeps knowing nothing about ABDM: a clinic
  // that never touches it runs exactly this registration, minus an ABHA.
  const patient = await registerPublicPatientWithAbha(
    clinicId,
    req.body as PublicRegisterPatientInput & { abhaTxnId?: string }
  );

  res.status(201).json({
    success: true,
    message: 'Registration successful',
    data: patient
  });
});

// Real doctors for the public landing/booking page.
export const getPublicDoctorsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { clinicId } = req.params as ClinicIdParams;
  const doctors = await getPublicDoctors(clinicId);

  res.status(200).json({ success: true, data: doctors });
});

// Real availability for a doctor on a date, derived from DoctorSchedule.
export const getPublicAvailabilityHandler = asyncHandler(async (req: Request, res: Response) => {
  const { clinicId } = req.params as ClinicIdParams;
  const { doctorId, date } = req.query as unknown as PublicAvailabilityQuery;
  const slots = await getAvailableSlots(clinicId, doctorId, date);

  res.status(200).json({ success: true, data: { doctorId, date, slots } });
});

// Public landing-page booking → real patient + real PENDING appointment + WhatsApp.
export const bookPublicAppointmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const { clinicId } = req.params as ClinicIdParams;
  const result = await createPublicBooking(clinicId, req.body as PublicBookingInput);

  res.status(201).json({
    success: true,
    message: 'Appointment booked',
    data: result
  });
});


// ── ABHA, done by the patient ──────────────────────────────────────────────
//
// The same two steps the desk has, on a page with no login. What is NOT here is
// a third step returning the ABHA for the form to post back: registration reads
// the verified result from the server against the txnId, so this endpoint hands
// out nothing that could be used to claim someone else's identity.

export const publicAbhaOtpHandler = asyncHandler(async (req: Request, res: Response) => {
  const { clinicId } = req.params as ClinicIdParams;
  const { aadhaar } = req.body as PublicAbhaOtpInput;

  const started = await startPublicAbhaOtp(clinicId, aadhaar);

  // txnId and ABDM's own wording (which names the masked mobile the OTP went
  // to). Nothing derived from the Aadhaar goes back to the browser.
  res.json({ success: true, data: started });
});

export const publicAbhaVerifyHandler = asyncHandler(async (req: Request, res: Response) => {
  const { clinicId } = req.params as ClinicIdParams;
  const { txnId, otp, mobile } = req.body as PublicAbhaVerifyInput;

  const verified = await verifyPublicAbhaOtp(clinicId, txnId, otp, mobile ?? '');

  res.json({ success: true, data: { ...verified, txnId } });
});
