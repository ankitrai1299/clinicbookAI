import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { recordFromRequest } from '../audit/audit.service.js';
import { createPatient, deletePatient, getPatients, getSinglePatient, updatePatient } from './patient.service.js';
import { CreatePatientInput, PatientIdParams, UpdatePatientInput } from './patient.schemas.js';

const getClinicId = (req: Request) => {
  const clinicId = req.user?.clinicId;

  if (!clinicId) {
    throw new AppError('Authentication required', 401);
  }

  return clinicId;
};

// A patient is a "ClinicBook patient" (belongs on the clinic dashboard) when they
// are reachable on WhatsApp — i.e. they have a real phone number. Booking, the
// WhatsApp bot and self-registration ALL capture a phone; only MediScribe's
// scribe-created records (a walk-in noted during a consultation) may have none.
// Filtering on a real phone keeps the clinic's patient list to people who
// actually booked / can be messaged, and leaves the scribe-only records to the
// scribe — without hiding anything MediScribe needs (it uses its own endpoint).
const hasRealPhone = (phone?: string | null): boolean => {
  const digits = (phone || '').replace(/\D/g, '');
  return digits.length >= 6 && !/^0+$/.test(digits);
};

export const createPatientHandler = asyncHandler(async (req: Request, res: Response) => {
  const clinicId = getClinicId(req);
  const patient = await createPatient(clinicId, req.body as CreatePatientInput);

  // Audited AFTER the write, so a row exists only for what actually happened.
  // The patient's name and phone are deliberately absent — the id identifies the
  // record, and the record already holds the details.
  recordFromRequest(req, {
    action: 'PATIENT_CREATED',
    resourceType: 'patient',
    resourceId: patient.id,
    patientId: patient.id
  });

  res.status(201).json({
    success: true,
    message: 'Patient created successfully',
    data: patient
  });
});

export const getPatientsHandler = asyncHandler(async (req: Request, res: Response) => {
  const clinicId = getClinicId(req);
  const patients = await getPatients(clinicId);

  // The ClinicBook dashboard lists WhatsApp/booking patients only — scribe-created
  // walk-ins with no phone stay in MediScribe, not here.
  const visible = patients.filter((p) => hasRealPhone(p.phone));

  // A list read is audited as one row with a count, not one row per patient: the
  // question this answers is "who pulled the patient list, and how much of it",
  // and a row per patient would bury every other event in the trail.
  recordFromRequest(req, {
    action: 'PATIENT_LIST_VIEWED',
    resourceType: 'patient',
    metadata: { count: visible.length }
  });

  res.status(200).json({
    success: true,
    data: visible
  });
});

export const getSinglePatientHandler = asyncHandler(async (req: Request, res: Response) => {
  const clinicId = getClinicId(req);
  const { id } = req.params as PatientIdParams;
  const patient = await getSinglePatient(clinicId, id);

  recordFromRequest(req, {
    action: 'PATIENT_VIEWED',
    resourceType: 'patient',
    resourceId: id,
    patientId: id
  });

  res.status(200).json({
    success: true,
    data: patient
  });
});

export const updatePatientHandler = asyncHandler(async (req: Request, res: Response) => {
  const clinicId = getClinicId(req);
  const { id } = req.params as PatientIdParams;
  const patient = await updatePatient(clinicId, id, req.body as UpdatePatientInput);

  // WHICH fields changed, never the values — "phone was edited" is the auditable
  // fact; the new phone number belongs in the patient record, not here.
  recordFromRequest(req, {
    action: 'PATIENT_UPDATED',
    resourceType: 'patient',
    resourceId: id,
    patientId: id,
    metadata: { fields: Object.keys((req.body ?? {}) as Record<string, unknown>).join(',') }
  });

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

  // The one action in this file that destroys a record. It is also the one the
  // audit trail existed to make answerable.
  recordFromRequest(req, {
    action: 'PATIENT_DELETED',
    resourceType: 'patient',
    resourceId: id,
    patientId: id
  });

  res.status(200).json({
    success: true,
    message: 'Patient deleted successfully'
  });
});