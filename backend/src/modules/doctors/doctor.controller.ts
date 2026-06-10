import { Request, Response } from 'express';

import { asyncHandler } from '../../utils/asyncHandler.js';
import { CreateDoctorInput, UpdateDoctorInput } from './doctor.schemas.js';
import { createDoctor, deleteDoctor, getDoctors, updateDoctor } from './doctor.service.js';

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
