import { randomInt } from 'crypto';

import { Patient, Prisma } from '@prisma/client';

import { prisma } from '../../config/prisma.js';
import { forClinic, type TenantClient } from '../../config/tenantPrisma.js';
import { AppError } from '../../utils/AppError.js';
import { createAppointment } from '../appointments/appointment.service.js';
import { isSlotAvailable } from '../../services/scheduling.service.js';
import { notifyPatientRegistered } from '../whatsapp/whatsapp.notifications.js';
import {
  CreatePatientInput,
  PublicBookingInput,
  PublicRegisterPatientInput,
  UpdatePatientInput
} from './patient.schemas.js';

// Tenant data (Patient, Doctor) is read/written through a clinic-scoped client
// (forClinic / db.*). The ONLY raw-prisma use here is `prisma.clinic` — the
// Clinic row is NOT a tenant child (its tenant key is its own id), and the public
// endpoints legitimately resolve "which clinic" from the URL before any scoping
// exists. Those lookups are read-only existence/name checks.

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

// Creates a patient with a guaranteed-unique patientCode. The DB unique
// constraint is the source of truth: on the rare collision (P2002 on
// patientCode) we regenerate and retry. Any other unique violation
// (e.g. duplicate clinic+phone) propagates unchanged. `db` is a clinic-scoped
// client, so clinicId is enforced on the create regardless of `data`.
const createPatientWithUniqueCode = async (
  db: TenantClient,
  data: Omit<Prisma.PatientUncheckedCreateInput, 'patientCode'>
): Promise<PatientRecord> => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await db.patient.create({
        data: { ...data, patientCode: generatePatientCode() },
        include: patientInclude
      });
    } catch (error) {
      const isCodeCollision =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        (error.meta?.target as string[] | undefined)?.includes('patientCode');
      if (isCodeCollision) {
        continue;
      }
      throw error;
    }
  }
  throw new AppError('Failed to generate a unique patient ID', 500);
};

export const createPatient = async (clinicId: string, input: CreatePatientInput): Promise<PatientRecord> => {
  const db = forClinic(clinicId);
  const patient = await createPatientWithUniqueCode(db, {
    clinicId,
    name: input.name.trim(),
    phone: normalizePhone(input.phone),
    language: input.language.trim()
  });

  // Fire-and-forget WhatsApp registration confirmation (no-op if unconfigured).
  // Logs patient_id, phone, wamid and delivery status (see notifyPatientRegistered).
  if (patient.phone && patient.clinic && patient.patientCode) {
    notifyPatientRegistered({
      to: patient.phone,
      clinicId: patient.clinicId,
      patientName: patient.name,
      clinicName: patient.clinic.name,
      patientCode: patient.patientCode
    });
  }

  return patient;
};

export interface PublicClinicInfo {
  id: string;
  name: string;
}

// Minimal, public-safe clinic lookup for the self-registration page. Exposes
// only the clinic name so the page can greet visitors; never auth-gated data.
// Raw prisma: Clinic is not a tenant child and there is no scope yet (the
// clinicId IS what we are resolving from the URL).
export const getPublicClinicInfo = async (clinicId: string): Promise<PublicClinicInfo> => {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { id: true, name: true }
  });

  if (!clinic) {
    throw new AppError('Clinic not found', 404);
  }

  return clinic;
};

// Public self-registration. Resolves the clinic from the URL (not from auth),
// then upserts on the (clinicId, phone) unique key so a repeated submission
// updates the existing record instead of failing. Fires a WhatsApp confirmation.
export const createPublicPatient = async (
  clinicId: string,
  input: PublicRegisterPatientInput
): Promise<PatientRecord> => {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { id: true, name: true }
  });

  if (!clinic) {
    throw new AppError('Clinic not found', 404);
  }

  const db = forClinic(clinicId);
  const phone = normalizePhone(input.phone);
  const fields = {
    name: input.name.trim(),
    age: input.age,
    gender: input.gender.trim(),
    healthConcern: input.healthConcern.trim()
  };

  // Explicit find-then-create/update (not upsert) so a brand-new registration
  // mints a unique patientCode, while a repeat submission updates the existing
  // record and preserves its original ID.
  const existing = await db.patient.findUnique({
    where: { clinicId_phone: { clinicId, phone } },
    select: { id: true }
  });

  const patient = existing
    ? await db.patient.update({
        where: { id: existing.id, clinicId },
        data: fields,
        include: patientInclude
      })
    : await createPatientWithUniqueCode(db, {
        clinicId,
        phone,
        language: 'English',
        source: 'public',
        ...fields
      });

  // Fire-and-forget WhatsApp registration confirmation (no-op if unconfigured).
  // Logs patient_id, phone, wamid and delivery status (see notifyPatientRegistered).
  if (patient.patientCode) {
    notifyPatientRegistered({
      to: phone,
      clinicId,
      patientName: patient.name,
      clinicName: clinic.name,
      patientCode: patient.patientCode
    });
  }

  return patient;
};

// Silent find-or-create used by booking flows: returns the existing patient for
// (clinic, phone) or creates one with a unique code. Unlike createPublicPatient
// it sends NO welcome message — the booking flow sends its own confirmation, so
// the patient receives exactly one message.
export const ensurePatient = async (
  clinicId: string,
  input: { name: string; phone: string; language?: string }
): Promise<PatientRecord> => {
  const db = forClinic(clinicId);
  const phone = normalizePhone(input.phone);
  const existing = await db.patient.findUnique({
    where: { clinicId_phone: { clinicId, phone } },
    include: patientInclude
  });
  if (existing) return existing;

  return createPatientWithUniqueCode(db, {
    clinicId,
    phone,
    name: input.name.trim(),
    language: (input.language ?? 'English').trim(),
    source: 'public'
  });
};

// Public-safe doctor list for the landing/booking page (no internal fields).
export const getPublicDoctors = async (clinicId: string) => {
  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { id: true } });
  if (!clinic) throw new AppError('Clinic not found', 404);

  const db = forClinic(clinicId);
  return db.doctor.findMany({
    where: { clinicId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, speciality: true }
  });
};

// Public landing-page booking. Creates a real patient (if new) and a real
// appointment (status PENDING — staff confirms), validating the slot against
// live availability, then fires the production WhatsApp confirmation.
export const createPublicBooking = async (clinicId: string, input: PublicBookingInput) => {
  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { id: true, name: true } });
  if (!clinic) throw new AppError('Clinic not found', 404);

  const db = forClinic(clinicId);
  const doctor = await db.doctor.findFirst({
    where: { id: input.doctorId, clinicId },
    select: { id: true, name: true }
  });
  if (!doctor) throw new AppError('Doctor not found at this clinic', 404);

  // Reject anything that isn't a real, currently-open slot.
  if (!(await isSlotAvailable(clinicId, doctor.id, input.date, input.time))) {
    throw new AppError('That time slot is no longer available. Please pick another slot.', 409);
  }

  const patient = await ensurePatient(clinicId, {
    name: input.name,
    phone: input.phone,
    language: input.language
  });

  // createAppointment defaults to PENDING and (notify:true) sends the production
  // WhatsApp booking confirmation through the approved template / session flow.
  const appointment = await createAppointment(clinicId, {
    patientId: patient.id,
    doctorId: doctor.id,
    appointmentDate: input.date,
    appointmentTime: input.time
  });

  return {
    appointmentId: appointment.id,
    status: appointment.status,
    patient: { id: patient.id, name: patient.name, phone: patient.phone, patientCode: patient.patientCode },
    doctor: doctor.name,
    date: appointment.appointmentDate.toISOString().slice(0, 10),
    time: appointment.appointmentTime,
    clinicName: clinic.name
  };
};

export const getPatients = async (clinicId: string): Promise<PatientRecord[]> => {
  const db = forClinic(clinicId);
  return db.patient.findMany({
    where: { clinicId },
    orderBy: { name: 'asc' },
    include: patientInclude
  });
};

export const getSinglePatient = async (clinicId: string, id: string): Promise<PatientRecord> => {
  const db = forClinic(clinicId);
  const patient = await db.patient.findFirst({
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
  const db = forClinic(clinicId);
  const existingPatient = await db.patient.findFirst({
    where: { id, clinicId }
  });

  if (!existingPatient) {
    throw new AppError('Patient not found', 404);
  }

  const patient = await db.patient.update({
    where: { id, clinicId },
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
  const db = forClinic(clinicId);
  const existingPatient = await db.patient.findFirst({
    where: { id, clinicId },
    select: { id: true }
  });

  if (!existingPatient) {
    throw new AppError('Patient not found', 404);
  }

  await db.patient.delete({
    where: { id, clinicId }
  });
};
