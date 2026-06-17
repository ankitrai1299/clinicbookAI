import { Request, Response } from 'express';

import { asyncHandler } from '../../utils/asyncHandler.js';
import { CreateDoctorInput, CreateLeaveInput, SetScheduleInput, UpdateDoctorInput } from './doctor.schemas.js';
import {
  addDoctorLeave,
  createDoctor,
  deleteDoctor,
  deleteDoctorLeave,
  getDoctorAppointments,
  getDoctorLeaves,
  getDoctorSchedule,
  getDoctors,
  setDoctorSchedule,
  updateDoctor,
} from './doctor.service.js';

const getClinicId = (req: Request) => req.user!.clinicId;

export const getDoctorsHandler = asyncHandler(async (req: Request, res: Response) => {
  const doctors = await getDoctors(getClinicId(req));
  res.status(200).json({ success: true, data: doctors });
});

export const createDoctorHandler = asyncHandler(async (req: Request, res: Response) => {
  const doctor = await createDoctor(getClinicId(req), req.body as CreateDoctorInput);
  res.status(201).json({ success: true, data: doctor });
});

export const updateDoctorHandler = asyncHandler(async (req: Request, res: Response) => {
  const doctor = await updateDoctor(getClinicId(req), req.params.id!, req.body as UpdateDoctorInput);
  res.status(200).json({ success: true, data: doctor });
});

export const deleteDoctorHandler = asyncHandler(async (req: Request, res: Response) => {
  await deleteDoctor(getClinicId(req), req.params.id!);
  res.status(204).send();
});

export const getDoctorScheduleHandler = asyncHandler(async (req: Request, res: Response) => {
  const schedule = await getDoctorSchedule(getClinicId(req), req.params.id!);
  res.status(200).json({ success: true, data: schedule });
});

export const setDoctorScheduleHandler = asyncHandler(async (req: Request, res: Response) => {
  const schedule = await setDoctorSchedule(getClinicId(req), req.params.id!, req.body as SetScheduleInput);
  res.status(200).json({ success: true, data: schedule });
});

export const getDoctorLeavesHandler = asyncHandler(async (req: Request, res: Response) => {
  const leaves = await getDoctorLeaves(getClinicId(req), req.params.id!);
  res.status(200).json({ success: true, data: leaves });
});

export const addDoctorLeaveHandler = asyncHandler(async (req: Request, res: Response) => {
  const leave = await addDoctorLeave(getClinicId(req), req.params.id!, req.body as CreateLeaveInput);
  res.status(201).json({ success: true, data: leave });
});

export const deleteDoctorLeaveHandler = asyncHandler(async (req: Request, res: Response) => {
  await deleteDoctorLeave(getClinicId(req), req.params.id!, req.params.leaveId!);
  res.status(204).send();
});

export const getDoctorAppointmentsHandler = asyncHandler(async (req: Request, res: Response) => {
  const appointments = await getDoctorAppointments(getClinicId(req), req.params.id!);
  res.status(200).json({ success: true, data: appointments });
});
