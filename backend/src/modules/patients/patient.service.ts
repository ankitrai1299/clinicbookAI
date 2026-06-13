import { Patient } from '@prisma/client';

import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { notifyPatientWelcome } from '../whatsapp/whatsapp.notifications.js';
import { CreatePatientInput, UpdatePatientInput } from './patient.schemas.js';

export interface AuthenticatedClinicContext {
  clinicId: string;
}

const patientInclude = {
  clinic: {
    select: {
      id: true,
      name: true,
      plan: true
    }
  }
} as const;

export type PatientRecord = Patient & {
  clinic?: {
    id: string;
    name: string;
    plan: string;
  };
};

const normalizePhone = (phone: string) => phone.trim();

export const createPatient = async (clinicId: string, input: CreatePatientInput): Promise<PatientRecord> => {
  const patient = await prisma.patient.create({
    data: {
      clinicId,
      name: input.name.trim(),
      phone: normalizePhone(input.phone),
      language: input.language.trim()
    },
    include: patientInclude
  });

  // Fire-and-forget WhatsApp welcome message (no-op if WhatsApp unconfigured).
  // Recorded in WhatsAppLog as messageType 'welcome' regardless of delivery.
  if (patient.phone && patient.clinic) {
    notifyPatientWelcome({
      to: patient.phone,
      clinicId: patient.clinicId,
      patientName: patient.name,
      clinicName: patient.clinic.name
    });
  }

  return patient;
};

export const getPatients = async (clinicId: string): Promise<PatientRecord[]> => {
  return prisma.patient.findMany({
    where: { clinicId },
    orderBy: { name: 'asc' },
    include: patientInclude
  });
};

export const getSinglePatient = async (clinicId: string, id: string): Promise<PatientRecord> => {
  const patient = await prisma.patient.findFirst({
    where: { id, clinicId },
    include: patientInclude
  });

  if (!patient) {
    throw new AppError('Patient not found', 404);
  }

  return patient;
};

export const updatePatient = async (
  clinicId: string,
  id: string,
  input: UpdatePatientInput
): Promise<PatientRecord> => {
  const existingPatient = await prisma.patient.findFirst({
    where: { id, clinicId }
  });

  if (!existingPatient) {
    throw new AppError('Patient not found', 404);
  }

  const patient = await prisma.patient.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.phone !== undefined ? { phone: normalizePhone(input.phone) } : {}),
      ...(input.language !== undefined ? { language: input.language.trim() } : {})
    },
    include: patientInclude
  });

  return patient;
};

export const deletePatient = async (clinicId: string, id: string): Promise<void> => {
  const existingPatient = await prisma.patient.findFirst({
    where: { id, clinicId },
    select: { id: true }
  });

  if (!existingPatient) {
    throw new AppError('Patient not found', 404);
  }

  await prisma.patient.delete({
    where: { id }
  });
};