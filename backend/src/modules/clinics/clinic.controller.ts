import { Request, Response } from 'express';

import { asyncHandler } from '../../utils/asyncHandler.js';
import { RegisterClinicInput, UpdateClinicInput } from './clinic.schemas.js';
import { getMyClinic, registerClinic, updateMyClinic } from './clinic.service.js';

export const registerClinicHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await registerClinic(req.body as RegisterClinicInput);

  res.status(201).json({
    success: true,
    message: 'Clinic registered successfully',
    data: result,
  });
});

export const getMyClinicHandler = asyncHandler(async (req: Request, res: Response) => {
  const clinic = await getMyClinic(req.user!.clinicId);
  res.status(200).json({ success: true, data: clinic });
});

export const updateMyClinicHandler = asyncHandler(async (req: Request, res: Response) => {
  const clinic = await updateMyClinic(req.user!.clinicId, req.body as UpdateClinicInput);
  res.status(200).json({ success: true, data: clinic });
});
