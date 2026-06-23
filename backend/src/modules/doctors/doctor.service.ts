import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { CreateDoctorInput, CreateLeaveInput, SetScheduleInput, UpdateDoctorInput } from './doctor.schemas.js';

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
    data: {
      clinicId,
      name: input.name.trim(),
      speciality: input.speciality.trim(),
      experienceYears: input.experienceYears ?? null,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
    },
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
      ...(input.experienceYears !== undefined ? { experienceYears: input.experienceYears } : {}),
      ...(input.email !== undefined ? { email: input.email.trim() || null } : {}),
      ...(input.phone !== undefined ? { phone: input.phone.trim() || null } : {}),
    },
  });
};

export const deleteDoctor = async (clinicId: string, id: string) => {
  await ensureDoctor(clinicId, id);
  await prisma.doctor.delete({ where: { id } });
};

// --- Weekly schedule -------------------------------------------------------

export const getDoctorSchedule = async (clinicId: string, id: string) => {
  await ensureDoctor(clinicId, id);
  return prisma.doctorSchedule.findMany({
    where: { clinicId, doctorId: id },
    orderBy: { dayOfWeek: 'asc' },
  });
};

// Replace the whole weekly schedule in one transaction (idempotent "set").
export const setDoctorSchedule = async (clinicId: string, id: string, input: SetScheduleInput) => {
  await ensureDoctor(clinicId, id);

  const days = input.entries.map((e) => e.dayOfWeek);
  if (new Set(days).size !== days.length) {
    throw new AppError('Duplicate weekday in schedule', 400);
  }

  await prisma.$transaction([
    prisma.doctorSchedule.deleteMany({ where: { doctorId: id } }),
    prisma.doctorSchedule.createMany({
      data: input.entries.map((e) => ({
        clinicId,
        doctorId: id,
        dayOfWeek: e.dayOfWeek,
        startTime: e.startTime,
        endTime: e.endTime,
        slotMinutes: e.slotMinutes,
        isActive: e.isActive,
      })),
    }),
  ]);

  return prisma.doctorSchedule.findMany({
    where: { clinicId, doctorId: id },
    orderBy: { dayOfWeek: 'asc' },
  });
};

// --- Leaves ----------------------------------------------------------------

export const getDoctorLeaves = async (clinicId: string, id: string) => {
  await ensureDoctor(clinicId, id);
  return prisma.doctorLeave.findMany({
    where: { clinicId, doctorId: id },
    orderBy: { startDate: 'asc' },
  });
};

export const addDoctorLeave = async (clinicId: string, id: string, input: CreateLeaveInput) => {
  await ensureDoctor(clinicId, id);
  return prisma.doctorLeave.create({
    data: {
      clinicId,
      doctorId: id,
      startDate: new Date(`${input.startDate}T00:00:00.000Z`),
      endDate: new Date(`${input.endDate}T00:00:00.000Z`),
      reason: input.reason?.trim() || null,
    },
  });
};

export const deleteDoctorLeave = async (clinicId: string, id: string, leaveId: string) => {
  await ensureDoctor(clinicId, id);
  const leave = await prisma.doctorLeave.findFirst({
    where: { id: leaveId, doctorId: id, clinicId },
    select: { id: true },
  });
  if (!leave) throw new AppError('Leave not found', 404);
  await prisma.doctorLeave.delete({ where: { id: leaveId } });
};

// --- Appointments for a doctor ---------------------------------------------

export const getDoctorAppointments = async (clinicId: string, id: string) => {
  await ensureDoctor(clinicId, id);
  return prisma.appointment.findMany({
    where: { clinicId, doctorId: id },
    include: { patient: { select: { id: true, name: true, phone: true } } },
    orderBy: [{ appointmentDate: 'asc' }, { appointmentTime: 'asc' }],
  });
};
