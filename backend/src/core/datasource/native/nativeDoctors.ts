// Native (Prisma/Postgres) implementation of DoctorPort. This is the current,
// tested behaviour lifted verbatim from doctor.service.ts and whatsapp.booking's
// doctor helpers — same queries, same guards — now reachable through the port so
// an EMR-backed clinic can swap in a different implementation without any caller
// changing. Every query goes through the clinic-scoped client (forClinic), so
// clinicId is injected into every where/data automatically.

import { forClinic, type TenantClient } from '../../../config/tenantPrisma.js';
import { AppError } from '../../../utils/AppError.js';
import type {
  CreateDoctorInput,
  UpdateDoctorInput,
  SetScheduleInput,
  CreateLeaveInput
} from '../../doctors/doctor.schemas.js';
import type { DoctorPort, DoctorRef } from '../ports.js';

const ensureDoctor = async (db: TenantClient, id: string): Promise<void> => {
  const doctor = await db.doctor.findFirst({ where: { id }, select: { id: true } });
  if (!doctor) throw new AppError('Doctor not found', 404);
};

export const nativeDoctors = (clinicId: string): DoctorPort => {
  const db = forClinic(clinicId);

  return {
    list: () => db.doctor.findMany({ where: { clinicId }, orderBy: { name: 'asc' } }),

    listRefs: () =>
      db.doctor.findMany({ where: { clinicId }, select: { id: true, name: true, speciality: true } }),

    listSpecialities: async (): Promise<string[]> => {
      const docs = await db.doctor.findMany({ where: { clinicId }, select: { speciality: true } });
      return [...new Set(docs.map((d) => d.speciality.trim()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b)
      );
    },

    listBySpeciality: (speciality: string): Promise<DoctorRef[]> =>
      db.doctor.findMany({
        where: { clinicId, speciality: { equals: speciality, mode: 'insensitive' } },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, speciality: true }
      }),

    listNames: async (): Promise<string[]> => {
      const docs = await db.doctor.findMany({ where: { clinicId }, select: { name: true } });
      return docs.map((d) => d.name);
    },

    create: async (input: CreateDoctorInput) => {
      const existing = await db.doctor.findFirst({
        where: { clinicId, name: input.name.trim() },
        select: { id: true }
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
          phone: input.phone?.trim() || null
        }
      });
    },

    update: async (id: string, input: UpdateDoctorInput) => {
      await ensureDoctor(db, id);
      if (input.name !== undefined) {
        const conflict = await db.doctor.findFirst({
          where: { clinicId, name: input.name.trim(), NOT: { id } },
          select: { id: true }
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
          ...(input.phone !== undefined ? { phone: input.phone.trim() || null } : {})
        }
      });
    },

    remove: async (id: string): Promise<void> => {
      await ensureDoctor(db, id);
      await db.doctor.delete({ where: { id, clinicId } });
    },

    getSchedule: async (id: string) => {
      await ensureDoctor(db, id);
      return db.doctorSchedule.findMany({
        where: { clinicId, doctorId: id },
        orderBy: { dayOfWeek: 'asc' }
      });
    },

    setSchedule: async (id: string, input: SetScheduleInput) => {
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
            isActive: e.isActive
          }))
        })
      ]);
      return db.doctorSchedule.findMany({
        where: { clinicId, doctorId: id },
        orderBy: { dayOfWeek: 'asc' }
      });
    },

    getLeaves: async (id: string) => {
      await ensureDoctor(db, id);
      return db.doctorLeave.findMany({
        where: { clinicId, doctorId: id },
        orderBy: { startDate: 'asc' }
      });
    },

    addLeave: async (id: string, input: CreateLeaveInput) => {
      await ensureDoctor(db, id);
      return db.doctorLeave.create({
        data: {
          clinicId,
          doctorId: id,
          startDate: new Date(`${input.startDate}T00:00:00.000Z`),
          endDate: new Date(`${input.endDate}T00:00:00.000Z`),
          reason: input.reason?.trim() || null
        }
      });
    },

    removeLeave: async (id: string, leaveId: string): Promise<void> => {
      await ensureDoctor(db, id);
      const leave = await db.doctorLeave.findFirst({
        where: { id: leaveId, doctorId: id, clinicId },
        select: { id: true }
      });
      if (!leave) throw new AppError('Leave not found', 404);
      await db.doctorLeave.delete({ where: { id: leaveId, clinicId } });
    }
  };
};
