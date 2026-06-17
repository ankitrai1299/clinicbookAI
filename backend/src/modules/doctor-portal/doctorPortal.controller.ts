import { Request, Response } from 'express';
import { AppointmentStatus } from '@prisma/client';

import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  addDoctorLeave,
  deleteDoctorLeave,
  getDoctorAppointments,
  getDoctorLeaves,
  getDoctorSchedule,
  setDoctorSchedule
} from '../doctors/doctor.service.js';
import { cancelAppointment, updateAppointment } from '../appointments/appointment.service.js';
import { registerDoctor, loginDoctor, getDoctorAccount } from './doctorAuth.service.js';
import {
  AppointmentDecisionInput,
  DoctorLoginInput,
  DoctorRegisterInput
} from './doctorPortal.schemas.js';
import { CreateLeaveInput, SetScheduleInput } from '../doctors/doctor.schemas.js';

// Pull the authenticated doctor out of the verified token. requireDoctorAuth
// guarantees role === 'DOCTOR', userId = doctorId, clinicId = platform clinic.
const getDoctorCtx = (req: Request) => {
  const doctorId = req.user?.userId;
  const clinicId = req.user?.clinicId;
  if (!doctorId || !clinicId) {
    throw new AppError('Authentication required', 401);
  }
  return { doctorId, clinicId };
};

const ensureOwnAppointment = async (clinicId: string, doctorId: string, id: string) => {
  const appt = await prisma.appointment.findFirst({
    where: { id, clinicId, doctorId },
    select: { id: true }
  });
  if (!appt) {
    throw new AppError('Appointment not found', 404);
  }
};

// --- Auth -----------------------------------------------------------------

export const registerDoctorHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await registerDoctor(req.body as DoctorRegisterInput);
  res.status(201).json({ success: true, message: 'Doctor account created', data: result });
});

export const loginDoctorHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await loginDoctor(req.body as DoctorLoginInput);
  res.status(200).json({ success: true, data: result });
});

export const getDoctorMeHandler = asyncHandler(async (req: Request, res: Response) => {
  const { doctorId } = getDoctorCtx(req);
  const doctor = await getDoctorAccount(doctorId);
  res.status(200).json({ success: true, data: doctor });
});

// --- Schedule -------------------------------------------------------------

export const getMyScheduleHandler = asyncHandler(async (req: Request, res: Response) => {
  const { doctorId, clinicId } = getDoctorCtx(req);
  const schedule = await getDoctorSchedule(clinicId, doctorId);
  res.status(200).json({ success: true, data: schedule });
});

export const setMyScheduleHandler = asyncHandler(async (req: Request, res: Response) => {
  const { doctorId, clinicId } = getDoctorCtx(req);
  const schedule = await setDoctorSchedule(clinicId, doctorId, req.body as SetScheduleInput);
  res.status(200).json({ success: true, message: 'Schedule saved', data: schedule });
});

// --- Leaves ---------------------------------------------------------------

export const getMyLeavesHandler = asyncHandler(async (req: Request, res: Response) => {
  const { doctorId, clinicId } = getDoctorCtx(req);
  const leaves = await getDoctorLeaves(clinicId, doctorId);
  res.status(200).json({ success: true, data: leaves });
});

export const addMyLeaveHandler = asyncHandler(async (req: Request, res: Response) => {
  const { doctorId, clinicId } = getDoctorCtx(req);
  const leave = await addDoctorLeave(clinicId, doctorId, req.body as CreateLeaveInput);
  res.status(201).json({ success: true, message: 'Leave added', data: leave });
});

export const deleteMyLeaveHandler = asyncHandler(async (req: Request, res: Response) => {
  const { doctorId, clinicId } = getDoctorCtx(req);
  await deleteDoctorLeave(clinicId, doctorId, req.params.leaveId);
  res.status(200).json({ success: true, message: 'Leave removed' });
});

// --- Appointments ---------------------------------------------------------

export const getMyAppointmentsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { doctorId, clinicId } = getDoctorCtx(req);
  const all = await getDoctorAppointments(clinicId, doctorId);
  const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : undefined;
  const data = status ? all.filter((a) => a.status === status) : all;
  res.status(200).json({ success: true, data });
});

// Approve / reject / reschedule. Reuses the appointment engine, so approval
// fires the WhatsApp confirmation and rejection fires alternate slots, and a
// dashboard notification is recorded — all centrally, no duplication here.
export const decideMyAppointmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const { doctorId, clinicId } = getDoctorCtx(req);
  const { id } = req.params;
  const body = req.body as AppointmentDecisionInput;

  await ensureOwnAppointment(clinicId, doctorId, id);

  let result;
  if (body.action === 'approve') {
    result = await updateAppointment(clinicId, id, { status: AppointmentStatus.CONFIRMED });
  } else if (body.action === 'reject') {
    result = await cancelAppointment(clinicId, id);
  } else {
    result = await updateAppointment(clinicId, id, {
      appointmentDate: body.appointmentDate,
      appointmentTime: body.appointmentTime,
      // a rescheduled request returns to PENDING so the new time is re-confirmed
      status: AppointmentStatus.PENDING
    });
  }

  res.status(200).json({ success: true, message: `Appointment ${body.action}d`, data: result });
});

// --- Patients (only those who have appointments with this doctor) ----------

export const getMyPatientsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { doctorId, clinicId } = getDoctorCtx(req);
  const patients = await prisma.patient.findMany({
    where: { clinicId, appointments: { some: { doctorId } } },
    select: {
      id: true,
      name: true,
      phone: true,
      language: true,
      age: true,
      gender: true,
      patientCode: true,
      createdAt: true
    },
    orderBy: { name: 'asc' }
  });
  res.status(200).json({ success: true, data: patients });
});
