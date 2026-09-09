import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { createAppointment } from '../../core/appointments/appointment.service.js';
import { isSlotAvailable } from '../../services/scheduling.service.js';
import { dataSourceFor } from '../datasource/index.js';
import { notifyPatientRegistered } from '../whatsapp/whatsapp.notifications.js';
import { emitEvent } from '../timeline/patientTimeline.service.js';
import { childConsentEvidence, guardianRequiredFor } from '../consent/childConsent.js';
import { grantConsent } from '../consent/consent.service.js';
import {
  CreatePatientInput,
  PublicBookingInput,
  PublicRegisterPatientInput,
  UpdatePatientInput
} from './patient.schemas.js';

// Patient reads/writes now go through the clinic's PatientPort (native Prisma
// today, an EMR adapter later). The unique patient-code minting, phone lookups
// and auto-onboard live in that port; this service keeps the orchestration —
// WhatsApp registration confirmations and the public landing-page booking flow
// (which spans doctor + slot + appointment). Clinic existence checks use raw
// prisma because Clinic is not a tenant child (its tenant key is its own id) and
// the public endpoints resolve "which clinic" from the URL before any scoping.

export interface AuthenticatedClinicContext {
  clinicId: string;
}

// Re-exported so existing importers are unaffected by the type's move into the
// data-source ports.
export type { PatientRecord } from '../datasource/ports.js';
import type { PatientRecord } from '../datasource/ports.js';

export const createPatient = async (
  clinicId: string,
  input: Omit<CreatePatientInput, 'phone'> & { phone?: string | null }
): Promise<PatientRecord> => {
  const patient = await dataSourceFor(clinicId).patients.create({
    name: input.name,
    phone: input.phone,
    language: input.language
  });

  emitEvent({
    clinicId,
    patientId: patient.id,
    type: 'registered',
    title: `${patient.name} registered`,
    actorType: 'staff'
  });

  // Fire-and-forget WhatsApp registration confirmation (no-op if unconfigured).
  if (patient.phone && patient.clinic && patient.patientCode) {
    notifyPatientRegistered({
      to: patient.phone,
      clinicId: patient.clinicId,
      patientName: patient.name,
      clinicName: patient.clinic.name,
      patientCode: patient.patientCode
    });
  }

  return patient;
};

export interface PublicClinicInfo {
  id: string;
  name: string;
}

// Minimal, public-safe clinic lookup for the self-registration page. Exposes
// only the clinic name so the page can greet visitors; never auth-gated data.
export const getPublicClinicInfo = async (clinicId: string): Promise<PublicClinicInfo> => {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { id: true, name: true }
  });
  if (!clinic) {
    throw new AppError('Clinic not found', 404);
  }
  return clinic;
};

// Public self-registration. Resolves the clinic from the URL (not from auth),
// then find-then-create/update on (clinicId, phone) so a repeated submission
// updates the existing record (preserving its ID/code) instead of failing.
export const createPublicPatient = async (
  clinicId: string,
  input: PublicRegisterPatientInput,
  /**
   * Facts about HOW they registered, for the welcome message and the dashboard
   * line — not stored here.
   *
   * Passed in rather than read back afterwards because both of those happen
   * inside this function, before an ABHA written by the caller would exist. A
   * patient told "welcome" without the ABHA they just created, and a dashboard
   * saying only "self-registered" about someone who proved their identity with
   * Aadhaar, are both simply less true than they could be.
   */
  registeredWith?: { abhaNumber?: string | null }
): Promise<PatientRecord> => {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { id: true, name: true }
  });
  if (!clinic) {
    throw new AppError('Clinic not found', 404);
  }

  // Checked HERE rather than in the schema because whether a guardian is needed
  // depends on the age in the same request — and because by this point the age
  // is the FINAL one: an Aadhaar-verified registration has already replaced what
  // was typed, and it is that age the law cares about.
  let guardian;
  try {
    guardian = guardianRequiredFor(input.age, input);
  } catch (err) {
    throw new AppError(err instanceof Error ? err.message : 'A guardian is required', 400);
  }

  const patients = dataSourceFor(clinicId).patients;
  const fields = {
    name: input.name.trim(),
    age: input.age,
    gender: input.gender.trim(),
    healthConcern: input.healthConcern.trim()
  };

  const existing = await patients.findByPhone(input.phone);
  const patient = existing
    ? await patients.update(existing.id, fields)
    : await patients.create({ phone: input.phone, language: 'English', source: 'public', ...fields });

  // Written straight to our own row: a guardian is not clinical data and not an
  // EMR's to own, the same reasoning as an ABHA. Only ever set, never cleared —
  // a patient who has had a birthday does not stop having had a guardian when
  // they were nine, and the consent given then was still given.
  if (guardian) {
    await prisma.patient.update({
      where: { id: patient.id },
      data: { guardianName: guardian.name, guardianRelation: guardian.relation }
    });

    // The consent for a child is the GUARDIAN's, and the record has to say so.
    // "Patient agreed" against a nine-year-old is not something anyone should be
    // able to read out of this table later.
    await grantConsent({
      clinicId,
      patientId: patient.id,
      phone: input.phone,
      purpose: 'privacy_notice',
      channel: 'web',
      evidence: childConsentEvidence(guardian, fields.name)
    });
  }

  if (!existing) {
    emitEvent({
      clinicId,
      patientId: patient.id,
      type: 'registered',
      title: registeredWith?.abhaNumber
        ? `${patient.name} self-registered with Aadhaar · ABHA ${registeredWith.abhaNumber}`
        : `${patient.name} self-registered`,
      actorType: 'patient'
    });
  }

  // Fire-and-forget WhatsApp registration confirmation (no-op if unconfigured).
  if (patient.patientCode && patient.phone) {
    notifyPatientRegistered({
      to: patient.phone,
      clinicId,
      patientName: patient.name,
      clinicName: clinic.name,
      patientCode: patient.patientCode,
      abhaNumber: registeredWith?.abhaNumber ?? null
    });
  }

  return patient;
};

// Silent find-or-create used by booking flows: returns the existing patient for
// (clinic, phone) or creates one with a unique code. Sends NO welcome message —
// the booking flow sends its own confirmation, so the patient gets exactly one.
export const ensurePatient = async (
  clinicId: string,
  input: { name: string; phone: string; language?: string }
): Promise<PatientRecord> => {
  const patients = dataSourceFor(clinicId).patients;
  const existing = await patients.findByPhone(input.phone);
  if (existing) return existing;

  return patients.create({
    name: input.name,
    phone: input.phone,
    language: input.language ?? 'English',
    source: 'public'
  });
};

// Public-safe doctor list for the landing/booking page (no internal fields).
export const getPublicDoctors = async (clinicId: string) => {
  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { id: true } });
  if (!clinic) throw new AppError('Clinic not found', 404);
  return dataSourceFor(clinicId).doctors.listRefs();
};

// Public landing-page booking. Creates a real patient (if new) and a real
// appointment (status PENDING — staff confirms), validating the slot against
// live availability, then fires the production WhatsApp confirmation.
export const createPublicBooking = async (clinicId: string, input: PublicBookingInput) => {
  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { id: true, name: true } });
  if (!clinic) throw new AppError('Clinic not found', 404);

  const doctor = await dataSourceFor(clinicId).doctors.findRefById(input.doctorId);
  if (!doctor) throw new AppError('Doctor not found at this clinic', 404);

  // Reject anything that isn't a real, currently-open slot.
  if (!(await isSlotAvailable(clinicId, doctor.id, input.date, input.time))) {
    throw new AppError('That time slot is no longer available. Please pick another slot.', 409);
  }

  const patient = await ensurePatient(clinicId, {
    name: input.name,
    phone: input.phone,
    language: input.language
  });

  // createAppointment defaults to PENDING and (notify:true) sends the production
  // WhatsApp booking confirmation through the approved template / session flow.
  const appointment = await createAppointment(clinicId, {
    patientId: patient.id,
    doctorId: doctor.id,
    appointmentDate: input.date,
    appointmentTime: input.time
  });

  return {
    appointmentId: appointment.id,
    status: appointment.status,
    patient: { id: patient.id, name: patient.name, phone: patient.phone, patientCode: patient.patientCode },
    doctor: doctor.name,
    date: appointment.appointmentDate.toISOString().slice(0, 10),
    time: appointment.appointmentTime,
    clinicName: clinic.name
  };
};

export const getPatients = (clinicId: string): Promise<PatientRecord[]> =>
  dataSourceFor(clinicId).patients.list();

export const getSinglePatient = async (clinicId: string, id: string): Promise<PatientRecord> => {
  const patient = await dataSourceFor(clinicId).patients.findById(id);
  if (!patient) {
    throw new AppError('Patient not found', 404);
  }
  return patient;
};

export const updatePatient = (
  clinicId: string,
  id: string,
  input: UpdatePatientInput
): Promise<PatientRecord> =>
  dataSourceFor(clinicId).patients.update(id, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    ...(input.language !== undefined ? { language: input.language } : {})
  });

export const deletePatient = (clinicId: string, id: string): Promise<void> =>
  dataSourceFor(clinicId).patients.remove(id);
