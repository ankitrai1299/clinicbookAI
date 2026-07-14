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
  // DEDUPE by phone: if the clinic already has this patient, reuse them so a scribe
  // note links to the SAME patient the rest of the clinic (and their WhatsApp)
  // sees — never a duplicate. Match on the last 10 digits (ignores +91 / spacing).
  const digits = (input.phone || '').replace(/\D/g, '');
  if (digits.length >= 10) {
    const tail = digits.slice(-10);
    const existing = await forClinic(clinicId).patient.findFirst({
      where: { phone: { contains: tail } },
      select: { id: true, name: true, phone: true, age: true, gender: true }
    });
    if (existing) return toScribePatient(existing);
  }

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

/** Live count of the clinic's doctors (ClinicBook) — for the admin dashboard. */
export const countClinicDoctors = (clinicId: string): Promise<number> =>
  forClinic(clinicId).doctor.count();

/** Live count of the clinic's patients (ClinicBook) — for the admin dashboard. */
export const countClinicPatients = (clinicId: string): Promise<number> =>
  forClinic(clinicId).patient.count();

// MediScribe ADMIN doctor shape (its Doctors page + search expect a "user"-like
// record). ClinicBook owns doctors as bookable resources (no login), so we map its
// Doctor into this shape with sensible constants — status is always 'active'.
export interface ScribeAdminDoctor {
  id: string;
  name: string;
  email: string;
  role: 'doctor';
  status: 'active';
  specialization: string;
  experience: number;
  licenseNumber: string;
  hospital: string;
  phone: string;
  createdAt?: string;
}

/** Every doctor in the clinic (ClinicBook), in the admin Doctors-page shape. */
export const listClinicDoctorsAdmin = async (clinicId: string): Promise<ScribeAdminDoctor[]> => {
  const doctors = await getDoctors(clinicId);
  return doctors.map((d: any) => ({
    id: d.id,
    name: d.name,
    email: d.email || '',
    role: 'doctor',
    status: 'active',
    specialization: d.speciality || '',
    experience: d.experienceYears ?? 0,
    licenseNumber: '',
    hospital: '',
    phone: d.phone || '',
    createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : undefined
  }));
};

// MediScribe ADMIN patient shape (its Patients page + growth analytics need
// createdAt + language, which the lean ScribePatient drops).
export interface ScribeAdminPatient extends ScribePatient {
  language?: string;
  createdAt?: string;
}

/** Every patient in the clinic (ClinicBook), richer shape for the admin page. */
export const listClinicPatientsAdmin = async (clinicId: string): Promise<ScribeAdminPatient[]> => {
  const rows = await forClinic(clinicId).patient.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, phone: true, age: true, gender: true, language: true, createdAt: true }
  });
  return rows.map((r) => ({
    ...toScribePatient(r),
    language: r.language || undefined,
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : undefined
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
