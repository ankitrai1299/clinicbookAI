import { forClinic, type TenantClient } from '../../config/tenantPrisma.js';
import { AppError } from '../../utils/AppError.js';
import { CreateDoctorInput, CreateLeaveInput, SetScheduleInput, UpdateDoctorInput } from './doctor.schemas.js';

// Every query in this module goes through a clinic-scoped client (forClinic).
// The clinicId is injected into every where/data automatically, so cross-clinic
// access is impossible even if a where clause forgets it. The explicit clinicId
// filters below are kept as defence-in-depth (and to document intent).

export const getDoctors = (clinicId: string) => {
  const db = forClinic(clinicId);
  return db.doctor.findMany({ where: { clinicId }, orderBy: { name: 'asc' } });
};

export const createDoctor = async (clinicId: string, input: CreateDoctorInput) => {
  const db = forClinic(clinicId);
  const existing = await db.doctor.findFirst({
    where: { clinicId, name: input.name.trim() },
    select: { id: true },
  });

  if (existing) {
    throw new AppError('A doctor with this name already exists in this clinic', 409);
  }

  return db.doctor.create({
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

const ensureDoctor = async (db: TenantClient, id: string) => {
  const doctor = await db.doctor.findFirst({ where: { id }, select: { id: true } });
  if (!doctor) throw new AppError('Doctor not found', 404);
};

export const updateDoctor = async (clinicId: string, id: string, input: UpdateDoctorInput) => {
  const db = forClinic(clinicId);
  await ensureDoctor(db, id);

  if (input.name !== undefined) {
    const conflict = await db.doctor.findFirst({
      where: { clinicId, name: input.name.trim(), NOT: { id } },
      select: { id: true },
    });
    if (conflict) throw new AppError('A doctor with this name already exists in this clinic', 409);
  }

  return db.doctor.update({
    where: { id, clinicId },
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
  const db = forClinic(clinicId);
  await ensureDoctor(db, id);
  await db.doctor.delete({ where: { id, clinicId } });
};

// --- Weekly schedule -------------------------------------------------------

export const getDoctorSchedule = async (clinicId: string, id: string) => {
  const db = forClinic(clinicId);
  await ensureDoctor(db, id);
  return db.doctorSchedule.findMany({
    where: { clinicId, doctorId: id },
    orderBy: { dayOfWeek: 'asc' },
  });
};

// Replace the whole weekly schedule in one transaction (idempotent "set").
export const setDoctorSchedule = async (clinicId: string, id: string, input: SetScheduleInput) => {
  const db = forClinic(clinicId);
  await ensureDoctor(db, id);

  const days = input.entries.map((e) => e.dayOfWeek);
  if (new Set(days).size !== days.length) {
    throw new AppError('Duplicate weekday in schedule', 400);
  }

  await db.$transaction([
    db.doctorSchedule.deleteMany({ where: { doctorId: id, clinicId } }),
    db.doctorSchedule.createMany({
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

  return db.doctorSchedule.findMany({
    where: { clinicId, doctorId: id },
    orderBy: { dayOfWeek: 'asc' },
  });
};

// --- Leaves ----------------------------------------------------------------

export const getDoctorLeaves = async (clinicId: string, id: string) => {
  const db = forClinic(clinicId);
  await ensureDoctor(db, id);
  return db.doctorLeave.findMany({
    where: { clinicId, doctorId: id },
    orderBy: { startDate: 'asc' },
  });
};

export const addDoctorLeave = async (clinicId: string, id: string, input: CreateLeaveInput) => {
  const db = forClinic(clinicId);
  await ensureDoctor(db, id);
  return db.doctorLeave.create({
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
  const db = forClinic(clinicId);
  await ensureDoctor(db, id);
  const leave = await db.doctorLeave.findFirst({
    where: { id: leaveId, doctorId: id, clinicId },
    select: { id: true },
  });
  if (!leave) throw new AppError('Leave not found', 404);
  await db.doctorLeave.delete({ where: { id: leaveId, clinicId } });
};

// --- Appointments for a doctor ---------------------------------------------

export const getDoctorAppointments = async (clinicId: string, id: string) => {
  const db = forClinic(clinicId);
  await ensureDoctor(db, id);
  return db.appointment.findMany({
    where: { clinicId, doctorId: id },
    include: { patient: { select: { id: true, name: true, phone: true } } },
    orderBy: [{ appointmentDate: 'asc' }, { appointmentTime: 'asc' }],
  });
};
