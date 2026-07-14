// Native (Prisma/Postgres) implementation of PatientPort. The patient-code
// generation + unique-retry, the (clinic, phone) lookups and the auto-onboard
// create are lifted verbatim from patient.service / whatsapp.inbound so
// behaviour is identical. WhatsApp-specific phone NORMALISATION stays in the
// caller (it's channel logic); this adapter only runs the queries. An EMR-backed
// clinic swaps this for an adapter that resolves patients from the HMIS.

import { randomInt } from 'crypto';

import { Prisma } from '@prisma/client';

import { forClinic } from '../../../config/tenantPrisma.js';
import { AppError } from '../../../utils/AppError.js';
import type { PatientPort, PatientRecord, PatientCreateData, PatientUpdateData } from '../ports.js';

const patientInclude = {
  clinic: { select: { id: true, name: true, plan: true } }
} as const;

// Human-readable patient identifier (e.g. "PT-7K4Q9D"). Excludes ambiguous
// characters (0/O, 1/I) so it is safe to read aloud or type from a message.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const generatePatientCode = (): string => {
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    suffix += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return `PT-${suffix}`;
};

const normalizePhone = (phone: string) => phone.trim();

export const nativePatients = (clinicId: string): PatientPort => {
  const db = forClinic(clinicId);

  // Creates a patient with a guaranteed-unique patientCode. The DB unique
  // constraint is the source of truth: on the rare patientCode collision (P2002)
  // we regenerate and retry. Any other unique violation (e.g. duplicate
  // clinic+phone) propagates unchanged.
  const createWithUniqueCode = async (
    data: Omit<Prisma.PatientUncheckedCreateInput, 'patientCode' | 'clinicId'>
  ): Promise<PatientRecord> => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await db.patient.create({
          data: { ...data, clinicId, patientCode: generatePatientCode() },
          include: patientInclude
        });
      } catch (error) {
        const isCodeCollision =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          (error.meta?.target as string[] | undefined)?.includes('patientCode');
        if (isCodeCollision) continue;
        throw error;
      }
    }
    throw new AppError('Failed to generate a unique patient ID', 500);
  };

  return {
    list: () =>
      db.patient.findMany({ where: { clinicId }, orderBy: { name: 'asc' }, include: patientInclude }),

    findById: (id: string) =>
      db.patient.findFirst({ where: { id, clinicId }, include: patientInclude }),

    findByPhone: (phone: string) =>
      db.patient.findUnique({
        where: { clinicId_phone: { clinicId, phone: normalizePhone(phone) } },
        include: patientInclude
      }),

    findByPhoneContains: (fragment: string) =>
      db.patient.findMany({
        where: { clinicId, phone: { contains: fragment } },
        orderBy: { createdAt: 'desc' },
        include: patientInclude
      }),

    listRecent: () =>
      db.patient.findMany({ where: { clinicId }, orderBy: { createdAt: 'desc' }, include: patientInclude }),

    create: (data: PatientCreateData) =>
      createWithUniqueCode({
        name: data.name.trim(),
        // No phone → store NULL (never a "0000000000" placeholder). Postgres allows
        // many NULLs under the (clinicId, phone) unique index.
        phone: data.phone && data.phone.trim() ? normalizePhone(data.phone) : null,
        language: data.language.trim(),
        ...(data.age !== undefined ? { age: data.age } : {}),
        ...(data.gender !== undefined ? { gender: data.gender } : {}),
        ...(data.healthConcern !== undefined ? { healthConcern: data.healthConcern } : {}),
        ...(data.source !== undefined ? { source: data.source } : {})
      }),

    onboard: (data: { name: string; phone: string; language: string; source: string }) =>
      db.patient.create({
        data: {
          clinicId,
          name: data.name,
          phone: data.phone,
          language: data.language,
          source: data.source
        },
        include: patientInclude
      }),

    update: async (id: string, data: PatientUpdateData): Promise<PatientRecord> => {
      const existing = await db.patient.findFirst({ where: { id, clinicId }, select: { id: true } });
      if (!existing) throw new AppError('Patient not found', 404);
      return db.patient.update({
        where: { id, clinicId },
        data: {
          ...(data.name !== undefined ? { name: data.name.trim() } : {}),
          ...(data.phone !== undefined ? { phone: normalizePhone(data.phone) } : {}),
          ...(data.language !== undefined ? { language: data.language.trim() } : {}),
          ...(data.age !== undefined ? { age: data.age } : {}),
          ...(data.gender !== undefined ? { gender: data.gender } : {}),
          ...(data.healthConcern !== undefined ? { healthConcern: data.healthConcern } : {})
        },
        include: patientInclude
      });
    },

    remove: async (id: string): Promise<void> => {
      const existing = await db.patient.findFirst({ where: { id, clinicId }, select: { id: true } });
      if (!existing) throw new AppError('Patient not found', 404);
      await db.patient.delete({ where: { id, clinicId } });
    }
  };
};
