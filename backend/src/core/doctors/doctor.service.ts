// Doctor service — now a thin delegate over the clinic's data source. The actual
// queries live in the native (Prisma) DoctorPort; an EMR-backed clinic swaps in
// a different implementation without this module or its controllers changing.
// Public function names/signatures are unchanged so all callers are unaffected.

import { forClinic } from '../../config/tenantPrisma.js';
import { AppError } from '../../utils/AppError.js';
import { dataSourceFor } from '../datasource/index.js';
import { CreateDoctorInput, CreateLeaveInput, SetScheduleInput, UpdateDoctorInput } from './doctor.schemas.js';

export const getDoctors = (clinicId: string) => dataSourceFor(clinicId).doctors.list();

export const createDoctor = (clinicId: string, input: CreateDoctorInput) =>
  dataSourceFor(clinicId).doctors.create(input);

export const updateDoctor = (clinicId: string, id: string, input: UpdateDoctorInput) =>
  dataSourceFor(clinicId).doctors.update(id, input);

export const deleteDoctor = (clinicId: string, id: string) =>
  dataSourceFor(clinicId).doctors.remove(id);

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
