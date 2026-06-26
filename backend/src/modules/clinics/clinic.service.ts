import bcrypt from 'bcryptjs';

import { signAccessToken } from '../../config/jwt.js';
import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { RegisterClinicInput, UpdateClinicInput } from './clinic.schemas.js';

// NOTE: this module intentionally uses the RAW prisma client. It manages the
// `Clinic` ROW itself (whose tenant key is its own id, so the tenant engine does
// not scope it) and clinic registration, which runs BEFORE any tenant exists.
// Every authenticated query here is still scoped by `where: { id: clinicId }`.

export const getMyClinic = async (clinicId: string) => {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { id: true, name: true, email: true, phone: true, plan: true },
  });
  if (!clinic) throw new AppError('Clinic not found', 404);
  return clinic;
};

export const updateMyClinic = async (clinicId: string, input: UpdateClinicInput) => {
  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { id: true } });
  if (!clinic) throw new AppError('Clinic not found', 404);

  return prisma.clinic.update({
    where: { id: clinicId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
    },
    select: { id: true, name: true, email: true, phone: true, plan: true },
  });
};

export const registerClinic = async (input: RegisterClinicInput) => {
  const email = input.email.trim().toLowerCase();

  const [existingClinic, existingUser] = await Promise.all([
    prisma.clinic.findUnique({ where: { email } }),
    prisma.user.findUnique({ where: { email } }),
  ]);

  if (existingClinic || existingUser) {
    throw new AppError('An account with this email already exists', 409);
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  const result = await prisma.$transaction(async (tx) => {
    const clinic = await tx.clinic.create({
      data: {
        name: input.clinicName.trim(),
        email,
        phone: input.phone.trim(),
      },
    });

    const user = await tx.user.create({
      data: {
        clinicId: clinic.id,
        name: input.ownerName.trim(),
        email,
        passwordHash,
      },
      select: {
        id: true,
        clinicId: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return { clinic, user };
  });

  const accessToken = signAccessToken({
    userId: result.user.id,
    clinicId: result.clinic.id,
    email: result.user.email,
    role: result.user.role,
  });

  return { user: result.user, accessToken };
};
