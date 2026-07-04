// Native (Prisma/Postgres) implementation of AppointmentPort. The persistence
// logic — clinic/doctor/patient existence checks, the atomic slot-lock
// transaction backed by the partial unique index, and the P2002/P2025
// translations — is lifted verbatim from appointment.service so behaviour is
// identical; only the ORCHESTRATION (events/notifications/waitlist/post-visit)
// stays in the service. An EMR-backed clinic swaps this for an adapter that
// talks to the external HMIS while the service is untouched.

import { AppointmentStatus, Prisma } from '@prisma/client';

import { forClinic } from '../../../config/tenantPrisma.js';
import { AppError } from '../../../utils/AppError.js';
import type {
  AppointmentPort,
  AppointmentRecord,
  AppointmentState,
  AppointmentCreateData,
  AppointmentUpdateData,
  ApplyUpdateResult
} from './appointment.port.js';
import { LOST_RACE } from './appointment.port.js';

// Joined shape every hydrated read/write returns (doctor + patient + clinic +
// reminders). Identical to the include appointment.service used before.
const appointmentInclude = {
  doctor: { select: { id: true, name: true, speciality: true } },
  patient: { select: { id: true, name: true, phone: true, language: true } },
  clinic: { select: { id: true, name: true, plan: true } },
  reminders: { select: { id: true, type: true, sent: true } }
} as const;

export const nativeAppointments = (clinicId: string): AppointmentPort => {
  const db = forClinic(clinicId);

  const ensureClinicDoctorPatient = async (doctorId: string, patientId: string): Promise<void> => {
    const [doctor, patient] = await Promise.all([
      db.doctor.findFirst({ where: { id: doctorId, clinicId }, select: { id: true } }),
      db.patient.findFirst({ where: { id: patientId, clinicId }, select: { id: true } })
    ]);
    if (!doctor) throw new AppError('Doctor not found', 404);
    if (!patient) throw new AppError('Patient not found', 404);
  };

  const create = async (input: AppointmentCreateData): Promise<AppointmentRecord> => {
    await ensureClinicDoctorPatient(input.doctorId, input.patientId);

    // Atomic slot lock. Re-check inside a transaction that no active
    // (non-cancelled) appointment holds this doctor/date/time, then create. The
    // partial unique index "Appointment_active_slot_key" is the final backstop
    // against a concurrent booking slipping between check and insert — it
    // surfaces as P2002, which we translate to a clean 409.
    try {
      return await db.$transaction(async (tx) => {
        const clash = await tx.appointment.findFirst({
          where: {
            clinicId,
            doctorId: input.doctorId,
            appointmentDate: input.appointmentDate,
            appointmentTime: input.appointmentTime,
            status: { not: AppointmentStatus.CANCELLED }
          },
          select: { id: true }
        });
        if (clash) {
          throw new AppError('That time slot is already booked for this doctor.', 409);
        }
        return tx.appointment.create({
          data: {
            clinicId,
            doctorId: input.doctorId,
            patientId: input.patientId,
            appointmentDate: input.appointmentDate,
            appointmentTime: input.appointmentTime,
            status: input.status
          },
          include: appointmentInclude
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError('That time slot is already booked for this doctor.', 409);
      }
      throw err;
    }
  };

  const list = (): Promise<AppointmentRecord[]> =>
    db.appointment.findMany({
      where: { clinicId },
      orderBy: [{ appointmentDate: 'asc' }, { appointmentTime: 'asc' }],
      include: appointmentInclude
    });

  const findFull = (id: string): Promise<AppointmentRecord | null> =>
    db.appointment.findFirst({ where: { id, clinicId }, include: appointmentInclude });

  const findState = (id: string): Promise<AppointmentState | null> =>
    db.appointment.findFirst({
      where: { id, clinicId },
      select: { status: true, doctorId: true, patientId: true, appointmentDate: true, appointmentTime: true }
    });

  const applyUpdate = async (
    id: string,
    data: AppointmentUpdateData,
    opts: { expectedStatus?: AppointmentStatus } = {}
  ): Promise<ApplyUpdateResult> => {
    const guarded = opts.expectedStatus !== undefined;
    try {
      return await db.appointment.update({
        // clinicId in the where makes the mutation itself tenant-scoped (an id
        // from another clinic matches no row). When guarding a transition, also
        // pin the current status so only ONE concurrent request flips it.
        where: guarded ? { id, clinicId, status: opts.expectedStatus } : { id, clinicId },
        data,
        include: appointmentInclude
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError('That time slot is already booked for this doctor.', 409);
      }
      // Lost the concurrent guarded transition: another request already applied
      // it. Signal the service to return the current record with no duplicate
      // side-effect rather than erroring.
      if (guarded && err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return LOST_RACE;
      }
      throw err;
    }
  };

  return { assertRefs: ensureClinicDoctorPatient, create, list, findFull, findState, applyUpdate };
};
