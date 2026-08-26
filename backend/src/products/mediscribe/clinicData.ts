// Bridge: expose ClinicBook's real clinic data (patients, doctors, appointments)
// to MediScribe, mapped into the shapes its frontend already expects. Both apps
// share one Postgres + clinicId, so a patient registered / doctor added / visit
// booked in ClinicBook shows up in the scribe automatically — a single source of
// truth (ClinicBook owns patients/doctors/appointments; MediScribe owns the
// consultation notes/reports/prescriptions it produces).

import { forClinic } from '../../config/tenantPrisma.js';
import { getPatients, createPatient } from '../../core/patients/patient.service.js';
import { getDoctors, createDoctor, updateDoctor, deleteDoctor } from '../../core/doctors/doctor.service.js';
import { getAppointments } from '../../core/appointments/appointment.service.js';
import { clinicNow, labelToMinutes } from '../../services/slotMath.js';
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
 * Find a CLINIC-WIDE patient by phone (last 10 digits) — used to block adding a
 * duplicate from the scribe. Unlike the doctor-scoped patient list, this sees the
 * WHOLE clinic (a number booked via WhatsApp or added by another doctor counts),
 * so the "already registered" check can't be bypassed by scope.
 */
export const findClinicPatientByPhone = async (
  clinicId: string,
  phone?: string | null
): Promise<{ id: string; name: string } | null> => {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  return forClinic(clinicId).patient.findFirst({
    where: { phone: { contains: digits.slice(-10) } },
    select: { id: true, name: true }
  });
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

  // No phone → create WITHOUT one (stored NULL). Never substitute a placeholder
  // like "0000000000"; the UI shows the patient with no phone instead.
  const created = await createPatient(clinicId, {
    name: input.name,
    phone: input.phone && input.phone.trim() ? input.phone.trim() : undefined,
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
  /**
   * Healthcare Professional Registry id, from hpr.abdm.gov.in.
   *
   * Typed in by an admin, because a doctor registers THEMSELVES on the portal
   * and comes back with an id — a clinic cannot obtain one on their behalf.
   * Blank for every doctor until they do, and the product has to read that as
   * normal rather than as missing data.
   */
  hprId: string;
  createdAt?: string;
}

/** Map one ClinicBook doctor into MediScribe's admin Doctors-page shape. */
export const toScribeAdminDoctor = (d: any): ScribeAdminDoctor => ({
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
  hprId: d.hprId || '',
  createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : undefined
});

/** Every doctor in the clinic (ClinicBook), in the admin Doctors-page shape. */
export const listClinicDoctorsAdmin = async (clinicId: string): Promise<ScribeAdminDoctor[]> => {
  const doctors = await getDoctors(clinicId);
  return doctors.map(toScribeAdminDoctor);
};

// Create/update/delete a REAL ClinicBook doctor from the scribe admin, so a doctor
// added/edited in EITHER app shows up in both. The scribe's Add-Doctor form fields
// (specialization/experience/…) map onto ClinicBook's Doctor.
export interface ScribeDoctorInput {
  name?: string;
  specialization?: string;
  experience?: number | string;
  email?: string;
  phone?: string;
  hprId?: string;
}

const toClinicDoctorInput = (b: ScribeDoctorInput) => {
  const exp = b.experience === undefined || b.experience === '' ? undefined : Number(b.experience);
  const phone = (b.phone || '').trim();
  const email = (b.email || '').trim();
  return {
    ...(b.name !== undefined ? { name: String(b.name).trim() } : {}),
    ...(b.specialization !== undefined ? { speciality: String(b.specialization).trim() || 'General Physician' } : {}),
    ...(exp !== undefined && !Number.isNaN(exp) ? { experienceYears: exp } : {}),
    // ClinicBook validates these — only send when they look valid, else omit.
    ...(email && /.+@.+\..+/.test(email) ? { email } : {}),
    ...(phone.length >= 6 ? { phone } : {}),
    // Sent even when blank — unlike the others, which are omitted when empty
    // because ClinicBook validates them. An id has no format to fail, and
    // omitting it would make a wrongly-typed one impossible to clear.
    ...(b.hprId !== undefined ? { hprId: String(b.hprId).trim() || null } : {})
  };
};

export const createClinicDoctor = async (clinicId: string, b: ScribeDoctorInput): Promise<ScribeAdminDoctor> => {
  const input = toClinicDoctorInput(b);
  if (!input.name || input.name.length < 2) throw new Error('Doctor name is required');
  if (!input.speciality) input.speciality = 'General Physician';
  const created = await createDoctor(clinicId, input as any);
  return toScribeAdminDoctor(created);
};

export const updateClinicDoctor = async (
  clinicId: string,
  id: string,
  b: ScribeDoctorInput
): Promise<ScribeAdminDoctor> => {
  const input = toClinicDoctorInput(b);
  const updated = await updateDoctor(clinicId, id, input as any);
  return toScribeAdminDoctor(updated);
};

export const deleteClinicDoctor = (clinicId: string, id: string): Promise<unknown> =>
  deleteDoctor(clinicId, id);

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

/** The clinic's scribe queue: today's + future live appointments, soonest first.
 *
 * Deliberately NOT `slotIsFuture` (that is the BOOKING filter — it hides anything
 * within the 30-min buffer AND anything already past). The scribe queue must keep
 * an appointment visible the WHOLE day — including one happening right now or that
 * started a few minutes ago — because the doctor documents the visit during or
 * after it. So the rule is simply "today (clinic-local) or later, not cancelled". */
/**
 * The ClinicBook Doctor this login IS.
 *
 * Two ways in, and the order is the whole point:
 *
 *   1. `Doctor.userId` — a real key, written when the account was created.
 *   2. the email — how it used to work, and still the only way for doctors who
 *      existed before the key did.
 *
 * The email path is why a doctor could sign in perfectly and see an EMPTY day:
 * `Doctor.email` is optional and typed by hand, so leaving it blank or typing a
 * different address made the match miss, and a miss looks exactly like "no
 * appointments booked". Nothing failed, so nothing was reported. Keys cannot be
 * mistyped — but the fallback stays until every doctor has one.
 */
export const findDoctorForLogin = async (
  clinicId: string,
  email?: string | null,
  userId?: string | null
): Promise<{ id: string; name: string } | null> => {
  const db = forClinic(clinicId);

  if (userId) {
    const byKey = await db.doctor.findFirst({ where: { userId }, select: { id: true, name: true } });
    if (byKey) return byKey;
  }

  const e = (email || '').trim();
  if (!e) return null;
  // Case-insensitive, and it must stay that way: the login is stored lowercased
  // while a Doctor row keeps whatever the admin typed ("A.K.DAS@gmail.com"), so
  // lowercasing only one side made a miss CERTAIN for any capitalised address.
  return db.doctor.findFirst({
    where: { email: { equals: e, mode: 'insensitive' } },
    select: { id: true, name: true }
  });
};

export const listUpcomingAppointments = async (
  clinicId: string,
  opts?: { doctorEmail?: string; doctorUserId?: string }
): Promise<UpcomingAppointment[]> => {
  const today = clinicNow().dateStr;

  // Doctor scope: a logged-in doctor sees only THEIR OWN appointments — the ones
  // belonging to the ClinicBook Doctor their login is. Resolved by
  // findDoctorForLogin, which prefers the `Doctor.userId` key and falls back to
  // the email for doctors created before that key existed.
  //
  // No matching Doctor → NO appointments, never "all of them". We cannot tell
  // which are theirs, and showing a doctor another doctor's patients is worse
  // than showing them nothing.
  //
  // Admins pass neither option, so they see every doctor's appointments.
  let onlyDoctorId: string | null = null;
  if (opts?.doctorEmail || opts?.doctorUserId) {
    const doc = await findDoctorForLogin(clinicId, opts.doctorEmail, opts.doctorUserId);
    onlyDoctorId = doc?.id ?? '__no_match__';
  }

  // Filtered in the QUERY, not afterwards. This used to pull the clinic's entire
  // appointment history — every row hydrated with its patient and doctor — and
  // then throw away everything except today onwards, which is a handful of rows.
  return (
    await getAppointments(clinicId, {
      fromDate: today,
      statuses: [...LIVE],
      ...(onlyDoctorId && onlyDoctorId !== '__no_match__' ? { doctorId: onlyDoctorId } : {}),
      limit: 200
    })
  )
    // A doctor whose login matched no Doctor row must see nothing — the sentinel
    // can't go into the query, so it is still enforced here.
    .filter(() => onlyDoctorId !== '__no_match__')
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
