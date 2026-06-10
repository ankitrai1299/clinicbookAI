import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { CreateDoctorInput, UpdateDoctorInput } from './doctor.schemas.js';

export const getDoctors = (clinicId: string) =>
  prisma.doctor.findMany({ where: { clinicId }, orderBy: { name: 'asc' } });

export const createDoctor = async (clinicId: string, input: CreateDoctorInput) => {
  const existing = await prisma.doctor.findFirst({
    where: { clinicId, name: input.name.trim() },
    select: { id: true },
  });

  if (existing) {
    throw new AppError('A doctor with this name already exists in this clinic', 409);
  }

  return prisma.doctor.create({
    data: { clinicId, name: input.name.trim(), speciality: input.speciality.trim() },
  });
};

const ensureDoctor = async (clinicId: string, id: string) => {
  const doctor = await prisma.doctor.findFirst({ where: { id, clinicId }, select: { id: true } });
  if (!doctor) throw new AppError('Doctor not found', 404);
};

export const updateDoctor = async (clinicId: string, id: string, input: UpdateDoctorInput) => {
  await ensureDoctor(clinicId, id);

  if (input.name !== undefined) {
    const conflict = await prisma.doctor.findFirst({
      where: { clinicId, name: input.name.trim(), NOT: { id } },
      select: { id: true },
    });
    if (conflict) throw new AppError('A doctor with this name already exists in this clinic', 409);
  }

  return prisma.doctor.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.speciality !== undefined ? { speciality: input.speciality.trim() } : {}),
    },
  });
};

export const deleteDoctor = async (clinicId: string, id: string) => {
  await ensureDoctor(clinicId, id);
  await prisma.doctor.delete({ where: { id } });
};
