import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { createPatient, deletePatient, getPatients, getSinglePatient, updatePatient } from './patient.service.js';
import { CreatePatientInput, PatientIdParams, UpdatePatientInput } from './patient.schemas.js';

const getClinicId = (req: Request) => {
  const clinicId = req.user?.clinicId;

  if (!clinicId) {
    throw new AppError('Authentication required', 401);
  }

  return clinicId;
};

export const createPatientHandler = asyncHandler(async (req: Request, res: Response) => {
  const clinicId = getClinicId(req);
  const patient = await createPatient(clinicId, req.body as CreatePatientInput);

  res.status(201).json({
    success: true,
    message: 'Patient created successfully',
    data: patient
  });
});

export const getPatientsHandler = asyncHandler(async (req: Request, res: Response) => {
  const clinicId = getClinicId(req);
  const patients = await getPatients(clinicId);

  res.status(200).json({
    success: true,
    data: patients
  });
});

export const getSinglePatientHandler = asyncHandler(async (req: Request, res: Response) => {
  const clinicId = getClinicId(req);
  const { id } = req.params as PatientIdParams;
  const patient = await getSinglePatient(clinicId, id);

  res.status(200).json({
    success: true,
    data: patient
  });
});

export const updatePatientHandler = asyncHandler(async (req: Request, res: Response) => {
  const clinicId = getClinicId(req);
  const { id } = req.params as PatientIdParams;
  const patient = await updatePatient(clinicId, id, req.body as UpdatePatientInput);

  res.status(200).json({
    success: true,
    message: 'Patient updated successfully',
    data: patient
  });
});

export const deletePatientHandler = asyncHandler(async (req: Request, res: Response) => {
  const clinicId = getClinicId(req);
  const { id } = req.params as PatientIdParams;

  await deletePatient(clinicId, id);

  res.status(200).json({
    success: true,
    message: 'Patient deleted successfully'
  });
});