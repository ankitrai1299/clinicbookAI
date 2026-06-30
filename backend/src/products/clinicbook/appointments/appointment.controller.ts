import { Request, Response } from 'express';

import { AppError } from '../../../utils/AppError.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import {
  cancelAppointment,
  completeAppointment,
  createAppointment,
  getAppointments,
  getSingleAppointment,
  markNoShowAppointment,
  updateAppointment
} from './appointment.service.js';
import { AppointmentIdParams, CreateAppointmentInput, UpdateAppointmentInput } from './appointment.schemas.js';

const getClinicId = (req: Request) => {
  const clinicId = req.user?.clinicId;

  if (!clinicId) {
    throw new AppError('Authentication required', 401);
  }

  return clinicId;
};

const getUserId = (req: Request) => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('Authentication required', 401);
  }

  return userId;
};

const applyStatusAction = async (clinicId: string, id: string, userId: string, status?: string) => {
  if (status === 'COMPLETED') {
    return completeAppointment(clinicId, id, userId);
  }

  if (status === 'CANCELLED') {
    return cancelAppointment(clinicId, id);
  }

  if (status === 'NO_SHOW') {
    return markNoShowAppointment(clinicId, id);
  }

  return null;
};

export const createAppointmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const clinicId = getClinicId(req);
  const appointment = await createAppointment(clinicId, req.body as CreateAppointmentInput);

  res.status(201).json({
    success: true,
    message: 'Appointment created successfully',
    data: appointment
  });
});

export const getAppointmentsHandler = asyncHandler(async (req: Request, res: Response) => {
  const clinicId = getClinicId(req);
  const appointments = await getAppointments(clinicId);

  res.status(200).json({
    success: true,
    data: appointments
  });
});

export const getSingleAppointmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const clinicId = getClinicId(req);
  const { id } = req.params as AppointmentIdParams;
  const appointment = await getSingleAppointment(clinicId, id);

  res.status(200).json({
    success: true,
    data: appointment
  });
});

export const completeAppointmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const clinicId = getClinicId(req);
  const userId = getUserId(req);
  const { id } = req.params as AppointmentIdParams;
  const appointment = await completeAppointment(clinicId, id, userId);

  res.status(200).json({
    success: true,
    message: 'Appointment marked completed',
    data: appointment
  });
});

export const patchAppointmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const clinicId = getClinicId(req);
  const userId = getUserId(req);
  const { id } = req.params as AppointmentIdParams;
  const input = req.body as UpdateAppointmentInput;

  const statusResult = await applyStatusAction(clinicId, id, userId, input.status);

  if (statusResult && Object.keys(input).length === 1) {
    res.status(200).json({
      success: true,
      message: 'Appointment status updated successfully',
      data: statusResult
    });
    return;
  }

  const appointment = await updateAppointment(clinicId, id, input);

  res.status(200).json({
    success: true,
    message: 'Appointment updated successfully',
    data: appointment
  });
});

export const deleteAppointmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const clinicId = getClinicId(req);
  const { id } = req.params as AppointmentIdParams;
  const appointment = await cancelAppointment(clinicId, id);

  res.status(200).json({
    success: true,
    message: 'Appointment cancelled successfully',
    data: appointment
  });
});