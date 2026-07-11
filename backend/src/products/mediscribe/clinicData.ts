// Bridge: expose ClinicBook's real clinic data (patients, doctors, appointments)
// to MediScribe, mapped into the shapes its frontend already expects. Both apps
// share one Postgres + clinicId, so a patient registered / doctor added / visit
// booked in ClinicBook shows up in the scribe automatically — a single source of
// truth (ClinicBook owns patients/doctors/appointments; MediScribe owns the
// consultation notes/reports/prescriptions it produces).

import { forClinic } from '../../config/tenantPrisma.js';
import { getPatients, createPatient } from '../../core/patients/patient.service.js';
import { getDoctors } from '../../core/doctors/doctor.service.js';
import { getAppointments } from '../../products/clinicbook/appointments/appointment.service.js';
import { clinicNow, labelToMinutes, slotIsFuture } from '../../services/slotMath.js';
import { AppointmentStatus } from '@prisma/client';

// MediScribe frontend patient shape.
export interface ScribePatient {
  id: string;
  name: string;
  age: number;
  gender: string;
  phone?: string;
}

const toScribePatient = (p: {
  id: string; name: string; phone?: string | null; age?: number | null; gender?: string | null;
}): ScribePatient => ({
  id: p.id,
  name: p.name,
  age: typeof p.age === 'number' ? p.age : 0,
  gender: p.gender || 'Unknown',
  phone: p.phone || undefined
});

/** Every patient registered in the clinic (ClinicBook), newest first. */
export const listClinicPatients = async (clinicId: string): Promise<ScribePatient[]> => {
  const patients = await getPatients(clinicId);
  return patients.map(toScribePatient);
};

/**
 * Add a patient from the scribe → creates a REAL ClinicBook patient (shared both
 * ways) and returns it with the ClinicBook id, so the consultation links to the
 * same patient the rest of the clinic sees.
 */
export const createClinicPatient = async (
  clinicId: string,
  input: { name: string; phone?: string; age?: number; gender?: string }
): Promise<ScribePatient> => {
  const created = await createPatient(clinicId, {
    name: input.name,
    phone: input.phone && input.phone.trim() ? input.phone.trim() : '0000000000',
    language: 'English'
  });
  // age/gender aren't part of the standard create contract — set them directly
  // (plain nullable columns) so the scribe keeps the clinical detail it collected.
  if (typeof input.age === 'number' || input.gender) {
    await forClinic(clinicId).patient.update({
      where: { id: created.id },
      data: {
        ...(typeof input.age === 'number' ? { age: input.age } : {}),
        ...(input.gender ? { gender: input.gender } : {})
      }
    });
  }
  return toScribePatient({ ...created, age: input.age ?? null, gender: input.gender ?? null });
};

// MediScribe frontend doctor shape.
export interface ScribeDoctor {
  id: string;
  name: string;
  speciality: string;
  experienceYears?: number;
}

/** Every doctor in the clinic (ClinicBook). */
export const listClinicDoctors = async (clinicId: string): Promise<ScribeDoctor[]> => {
  const doctors = await getDoctors(clinicId);
  return doctors.map((d) => ({
    id: d.id,
    name: d.name,
    speciality: d.speciality,
    experienceYears: d.experienceYears ?? undefined
  }));
};

// A doctor's upcoming appointment, shown on the scribe dashboard so the doctor can
// start a consultation for that visit in one click.
export interface UpcomingAppointment {
  id: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  speciality?: string;
  date: string; // YYYY-MM-DD (clinic-local calendar day)
  time: string; // "HH:MM AM/PM"
}

const LIVE = new Set<AppointmentStatus>([AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED]);
const dateStrOf = (d: Date): string => d.toISOString().slice(0, 10);

/** The clinic's still-upcoming appointments (future, not cancelled), soonest first. */
export const listUpcomingAppointments = async (clinicId: string): Promise<UpcomingAppointment[]> => {
  const now = clinicNow();
  return (await getAppointments(clinicId))
    .filter((a) => LIVE.has(a.status))
    .filter((a) => slotIsFuture(labelToMinutes(a.appointmentTime) ?? 0, dateStrOf(a.appointmentDate), now))
    .sort(
      (a, b) =>
        dateStrOf(a.appointmentDate).localeCompare(dateStrOf(b.appointmentDate)) ||
        (labelToMinutes(a.appointmentTime) ?? 0) - (labelToMinutes(b.appointmentTime) ?? 0)
    )
    .map((a) => ({
      id: a.id,
      patientId: a.patientId,
      patientName: a.patient?.name ?? 'Patient',
      doctorId: a.doctorId,
      doctorName: a.doctor?.name ?? 'Doctor',
      speciality: a.doctor?.speciality,
      date: dateStrOf(a.appointmentDate),
      time: a.appointmentTime
    }));
};
