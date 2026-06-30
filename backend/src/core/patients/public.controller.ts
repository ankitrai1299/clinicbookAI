import { Request, Response } from 'express';

import { asyncHandler } from '../../utils/asyncHandler.js';
import { getAvailableSlots } from '../../services/scheduling.service.js';
import {
  ClinicIdParams,
  PublicAvailabilityQuery,
  PublicBookingInput,
  PublicRegisterPatientInput
} from './patient.schemas.js';
import {
  createPublicBooking,
  createPublicPatient,
  getPublicClinicInfo,
  getPublicDoctors
} from './patient.service.js';

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
  const patient = await createPublicPatient(clinicId, req.body as PublicRegisterPatientInput);

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
