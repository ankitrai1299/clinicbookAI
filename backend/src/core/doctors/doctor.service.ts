// Doctor service — now a thin delegate over the clinic's data source. The actual
// queries live in the native (Prisma) DoctorPort; an EMR-backed clinic swaps in
// a different implementation without this module or its controllers changing.
// Public function names/signatures are unchanged so all callers are unaffected.

import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';

import { forClinic } from '../../config/tenantPrisma.js';
import { AppError } from '../../utils/AppError.js';
import { dataSourceFor } from '../datasource/index.js';
import {
  CreateDoctorInput,
  CreateLeaveInput,
  SetDoctorCredentialsInput,
  SetScheduleInput,
  UpdateDoctorInput,
} from './doctor.schemas.js';

export const getDoctors = (clinicId: string) => dataSourceFor(clinicId).doctors.list();

export const createDoctor = (clinicId: string, input: CreateDoctorInput) =>
  dataSourceFor(clinicId).doctors.create(input);

export const updateDoctor = (clinicId: string, id: string, input: UpdateDoctorInput) =>
  dataSourceFor(clinicId).doctors.update(id, input);

export const deleteDoctor = (clinicId: string, id: string) =>
  dataSourceFor(clinicId).doctors.remove(id);

// Give a doctor app-login credentials (admin action). Sets the password on the
// doctor's OWN row (clinic-scoped), so they can sign in to the doctor app and see
// only their own data. Requires an email to log in with.
export const setDoctorCredentials = async (
  clinicId: string,
  id: string,
  input: SetDoctorCredentialsInput
): Promise<{ id: string; email: string }> => {
  const db = forClinic(clinicId);
  const doctor = await db.doctor.findFirst({ where: { id }, select: { id: true, email: true } });
  if (!doctor) throw new AppError('Doctor not found', 404);

  const email = (input.email ?? doctor.email ?? '').trim().toLowerCase();
  if (!email) throw new AppError('Add an email for this doctor before enabling login.', 400);

  const passwordHash = await bcrypt.hash(input.password, 12);
  try {
    await db.doctor.update({ where: { id }, data: { email, passwordHash } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError('That email is already used by another doctor.', 409);
    }
    throw err;
  }
  return { id, email };
};

// --- Weekly schedule -------------------------------------------------------

export const getDoctorSchedule = (clinicId: string, id: string) =>
  dataSourceFor(clinicId).doctors.getSchedule(id);

export const setDoctorSchedule = (clinicId: string, id: string, input: SetScheduleInput) =>
  dataSourceFor(clinicId).doctors.setSchedule(id, input);

// --- Leaves ----------------------------------------------------------------

export const getDoctorLeaves = (clinicId: string, id: string) =>
  dataSourceFor(clinicId).doctors.getLeaves(id);

export const addDoctorLeave = (clinicId: string, id: string, input: CreateLeaveInput) =>
  dataSourceFor(clinicId).doctors.addLeave(id, input);

export const deleteDoctorLeave = (clinicId: string, id: string, leaveId: string) =>
  dataSourceFor(clinicId).doctors.removeLeave(id, leaveId);

// --- Appointments for a doctor ---------------------------------------------
// Still reads the appointment table directly (Appointment domain is migrated
// behind the seam in a later step). Kept clinic-scoped via forClinic.

export const getDoctorAppointments = async (clinicId: string, id: string) => {
  const db = forClinic(clinicId);
  const doctor = await db.doctor.findFirst({ where: { id }, select: { id: true } });
  if (!doctor) throw new AppError('Doctor not found', 404);
  return db.appointment.findMany({
    where: { clinicId, doctorId: id },
    include: { patient: { select: { id: true, name: true, phone: true } } },
    orderBy: [{ appointmentDate: 'asc' }, { appointmentTime: 'asc' }]
  });
};
