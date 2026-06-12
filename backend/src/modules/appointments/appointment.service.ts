import { Appointment, AppointmentStatus } from '@prisma/client';

import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { notifyBookingConfirmation } from '../whatsapp/whatsapp.notifications.js';
import { CreateAppointmentInput, UpdateAppointmentInput } from './appointment.schemas.js';

const appointmentInclude = {
  doctor: {
    select: {
      id: true,
      name: true,
      speciality: true
    }
  },
  patient: {
    select: {
      id: true,
      name: true,
      phone: true,
      language: true
    }
  },
  clinic: {
    select: {
      id: true,
      name: true,
      plan: true
    }
  },
  reminders: {
    select: {
      id: true,
      type: true,
      sent: true
    }
  }
} as const;

export type AppointmentRecord = Appointment & {
  doctor?: {
    id: string;
    name: string;
    speciality: string;
  };
  patient?: {
    id: string;
    name: string;
    phone: string;
    language: string;
  };
  clinic?: {
    id: string;
    name: string;
    plan: string;
  };
  reminders?: Array<{
    id: string;
    type: string;
    sent: boolean;
  }>;
};

const normalizeDate = (appointmentDate: string) => {
  const date = new Date(appointmentDate);

  if (Number.isNaN(date.getTime())) {
    throw new AppError('Invalid appointment date', 400);
  }

  return date;
};

const ensureClinicDoctorPatient = async (clinicId: string, doctorId: string, patientId: string) => {
  const [doctor, patient] = await Promise.all([
    prisma.doctor.findFirst({ where: { id: doctorId, clinicId }, select: { id: true } }),
    prisma.patient.findFirst({ where: { id: patientId, clinicId }, select: { id: true } })
  ]);

  if (!doctor) {
    throw new AppError('Doctor not found', 404);
  }

  if (!patient) {
    throw new AppError('Patient not found', 404);
  }
};

const ensureAppointmentExists = async (clinicId: string, id: string) => {
  const appointment = await prisma.appointment.findFirst({
    where: { id, clinicId },
    select: { id: true }
  });

  if (!appointment) {
    throw new AppError('Appointment not found', 404);
  }
};

export const createAppointment = async (clinicId: string, input: CreateAppointmentInput): Promise<AppointmentRecord> => {
  await ensureClinicDoctorPatient(clinicId, input.doctorId, input.patientId);

  const appointment = await prisma.appointment.create({
    data: {
      clinicId,
      doctorId: input.doctorId,
      patientId: input.patientId,
      appointmentDate: normalizeDate(input.appointmentDate),
      appointmentTime: input.appointmentTime.trim(),
      status: input.status ?? AppointmentStatus.PENDING
    },
    include: appointmentInclude
  });

  // Fire-and-forget WhatsApp booking confirmation (no-op if WhatsApp unconfigured).
  if (appointment.patient?.phone && appointment.doctor && appointment.clinic) {
    notifyBookingConfirmation({
      to: appointment.patient.phone,
      clinicId: appointment.clinicId,
      patientName: appointment.patient.name,
      doctorName: appointment.doctor.name,
      clinicName: appointment.clinic.name,
      appointmentDate: appointment.appointmentDate,
      appointmentTime: appointment.appointmentTime
    });
  }

  return appointment;
};

export const getAppointments = async (clinicId: string): Promise<AppointmentRecord[]> => {
  return prisma.appointment.findMany({
    where: { clinicId },
    orderBy: [{ appointmentDate: 'asc' }, { appointmentTime: 'asc' }],
    include: appointmentInclude
  });
};

export const getSingleAppointment = async (clinicId: string, id: string): Promise<AppointmentRecord> => {
  const appointment = await prisma.appointment.findFirst({
    where: { id, clinicId },
    include: appointmentInclude
  });

  if (!appointment) {
    throw new AppError('Appointment not found', 404);
  }

  return appointment;
};

export const updateAppointment = async (
  clinicId: string,
  id: string,
  input: UpdateAppointmentInput
): Promise<AppointmentRecord> => {
  await ensureAppointmentExists(clinicId, id);

  if (input.doctorId !== undefined || input.patientId !== undefined) {
    const currentAppointment = await prisma.appointment.findFirst({
      where: { id, clinicId },
      select: { doctorId: true, patientId: true }
    });

    if (!currentAppointment) {
      throw new AppError('Appointment not found', 404);
    }

    await ensureClinicDoctorPatient(
      clinicId,
      input.doctorId ?? currentAppointment.doctorId,
      input.patientId ?? currentAppointment.patientId
    );
  }

  const appointment = await prisma.appointment.update({
    where: { id },
    data: {
      ...(input.doctorId !== undefined ? { doctorId: input.doctorId } : {}),
      ...(input.patientId !== undefined ? { patientId: input.patientId } : {}),
      ...(input.appointmentDate !== undefined ? { appointmentDate: normalizeDate(input.appointmentDate) } : {}),
      ...(input.appointmentTime !== undefined ? { appointmentTime: input.appointmentTime.trim() } : {}),
      ...(input.status !== undefined ? { status: input.status } : {})
    },
    include: appointmentInclude
  });

  return appointment;
};

export const cancelAppointment = async (clinicId: string, id: string): Promise<AppointmentRecord> => {
  await ensureAppointmentExists(clinicId, id);

  return prisma.appointment.update({
    where: { id },
    data: { status: AppointmentStatus.CANCELLED },
    include: appointmentInclude
  });
};

export const completeAppointment = async (clinicId: string, id: string): Promise<AppointmentRecord> => {
  await ensureAppointmentExists(clinicId, id);

  return prisma.appointment.update({
    where: { id },
    data: { status: AppointmentStatus.COMPLETED },
    include: appointmentInclude
  });
};

export const markNoShowAppointment = async (clinicId: string, id: string): Promise<AppointmentRecord> => {
  await ensureAppointmentExists(clinicId, id);

  return prisma.appointment.update({
    where: { id },
    data: { status: AppointmentStatus.NO_SHOW },
    include: appointmentInclude
  });
};