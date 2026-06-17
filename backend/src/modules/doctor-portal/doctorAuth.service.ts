import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';

import { prisma } from '../../config/prisma.js';
import { signAccessToken } from '../../config/jwt.js';
import { AppError } from '../../utils/AppError.js';
import { DoctorLoginInput, DoctorRegisterInput } from './doctorPortal.schemas.js';

// Doctors are PLATFORM-level on ClinicBook AI — they do NOT each get their own
// clinic. Under the hood every self-registered doctor is attached to a single
// hidden "platform clinic" so the existing clinic-scoped schema (appointments,
// schedules, patients, notifications) keeps working unchanged. Each doctor's
// portal is scoped to their own doctorId, so they only ever see their own data.
const PLATFORM_CLINIC_EMAIL = 'platform@clinicbook.ai';

export const getPlatformClinicId = async (): Promise<string> => {
  const clinic = await prisma.clinic.upsert({
    where: { email: PLATFORM_CLINIC_EMAIL },
    update: {},
    create: {
      name: 'ClinicBook AI',
      email: PLATFORM_CLINIC_EMAIL,
      phone: 'platform-clinicbook-ai',
      plan: 'ENTERPRISE'
    },
    select: { id: true }
  });
  return clinic.id;
};

const publicDoctorSelect = {
  id: true,
  clinicId: true,
  name: true,
  speciality: true,
  email: true,
  phone: true
} as const satisfies Prisma.DoctorSelect;

export type PublicDoctor = Prisma.DoctorGetPayload<{ select: typeof publicDoctorSelect }>;

export interface DoctorAuthResult {
  doctor: PublicDoctor;
  accessToken: string;
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const buildAuthResult = (doctor: PublicDoctor): DoctorAuthResult => ({
  doctor,
  accessToken: signAccessToken({
    userId: doctor.id, // doctorId travels in the standard `userId` claim
    clinicId: doctor.clinicId,
    email: doctor.email ?? '',
    role: 'DOCTOR'
  })
});

export const registerDoctor = async (input: DoctorRegisterInput): Promise<DoctorAuthResult> => {
  const clinicId = await getPlatformClinicId();
  const email = normalizeEmail(input.email);
  const passwordHash = await bcrypt.hash(input.password, 12);

  // If a doctor with this email already exists on the platform: either it's an
  // already-activated account (reject) or an admin-created record without a
  // login yet (claim it, preserving its id/schedule/appointments).
  const existing = await prisma.doctor.findFirst({ where: { clinicId, email } });
  if (existing) {
    if (existing.passwordHash) {
      throw new AppError('An account with this email already exists', 409);
    }
    const claimed = await prisma.doctor.update({
      where: { id: existing.id },
      data: {
        name: input.name.trim(),
        speciality: input.speciality.trim(),
        phone: input.phone.trim(),
        passwordHash
      },
      select: publicDoctorSelect
    });
    return buildAuthResult(claimed);
  }

  try {
    const doctor = await prisma.doctor.create({
      data: {
        clinicId,
        name: input.name.trim(),
        speciality: input.speciality.trim(),
        email,
        phone: input.phone.trim(),
        passwordHash
      },
      select: publicDoctorSelect
    });
    return buildAuthResult(doctor);
  } catch (err) {
    // @@unique([clinicId, name]) — a doctor with this exact name already exists.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError('A doctor with this name already exists. Please add a distinguishing detail (e.g. middle initial).', 409);
    }
    throw err;
  }
};

export const loginDoctor = async (input: DoctorLoginInput): Promise<DoctorAuthResult> => {
  const email = normalizeEmail(input.email);
  const doctor = await prisma.doctor.findFirst({
    where: { email, passwordHash: { not: null } }
  });

  if (!doctor || !doctor.passwordHash) {
    throw new AppError('Invalid email or password', 401);
  }

  const valid = await bcrypt.compare(input.password, doctor.passwordHash);
  if (!valid) {
    throw new AppError('Invalid email or password', 401);
  }

  const { passwordHash: _omit, ...rest } = doctor;
  return buildAuthResult({
    id: rest.id,
    clinicId: rest.clinicId,
    name: rest.name,
    speciality: rest.speciality,
    email: rest.email,
    phone: rest.phone
  });
};

export const getDoctorAccount = async (doctorId: string): Promise<PublicDoctor> => {
  const doctor = await prisma.doctor.findUnique({
    where: { id: doctorId },
    select: publicDoctorSelect
  });
  if (!doctor) {
    throw new AppError('Doctor not found', 404);
  }
  return doctor;
};
