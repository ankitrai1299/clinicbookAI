// OpenEMR (FHIR R4) ClinicDataSource. Implements the SAME DoctorPort / SlotPort /
// PatientPort the native Postgres source implements, but backs them with FHIR
// calls + the pure mappers. Because it satisfies the identical contracts, a
// clinic routed here books over WhatsApp exactly as a native clinic does — the
// FSM, brain, notifications and events never know the difference.
//
// This is FHIR-generic: the same code works against Epic/Cerner sandboxes; only
// the transport's base URL + auth differ. Doctor-roster and schedule writes throw
// (the EMR owns them). Appointment WRITE + local mirror + ExternalIdMap are
// Phase 4 (through appointmentSourceFor, not here).

import type { Doctor } from '@prisma/client';

import { AppError } from '../../../utils/AppError.js';
import { canonicalizeTime, clinicNow, labelToMinutes, slotIsFuture } from '../../../services/slotMath.js';
import type {
  ClinicDataSource,
  DoctorPort,
  DoctorRef,
  SlotPort,
  PatientPort,
  PatientRecord,
  PatientCreateData
} from '../../../core/datasource/ports.js';
import type { FhirClient } from '../fhir/fhirClient.js';
import type { FhirBundle, FhirPractitioner, FhirPractitionerRole, FhirSlot, FhirPatient } from '../fhir/types.js';
import {
  bundleToDoctorRefs,
  buildSpecialtyIndex,
  practitionerToDoctorRef,
  slotBundleToLabels,
  patientBundleToRecords,
  patientToRecord
} from '../fhir/mappers.js';

const ROSTER_MANAGED = async (): Promise<never> => {
  throw new AppError('This clinic’s doctors are managed in its EMR, not in ClinicBook.', 400);
};

const nextDay = (dateStr: string): string => {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

const openEmrDoctors = (clinicId: string, client: FhirClient): DoctorPort => {
  const refs = async (): Promise<DoctorRef[]> => {
    const [practitioners, roles] = await Promise.all([
      client.search<FhirPractitioner>('Practitioner', { active: 'true' }),
      client.search<FhirPractitionerRole>('PractitionerRole', {})
    ]);
    return bundleToDoctorRefs(practitioners, roles);
  };

  const asDoctor = (r: DoctorRef): Doctor =>
    ({ id: r.id, clinicId, name: r.name, speciality: r.speciality, experienceYears: null, email: null, phone: null, passwordHash: null }) as Doctor;

  // One practitioner by id: a read + a scoped role search, instead of pulling the
  // whole Practitioner + PractitionerRole bundles to find a single doctor.
  const findRefById = async (id: string): Promise<DoctorRef | null> => {
    try {
      const [practitioner, roles] = await Promise.all([
        client.read<FhirPractitioner>('Practitioner', id),
        client.search<FhirPractitionerRole>('PractitionerRole', { practitioner: `Practitioner/${id}` })
      ]);
      if (!practitioner?.id) return null;
      return practitionerToDoctorRef(practitioner, buildSpecialtyIndex(roles));
    } catch {
      return null; // 404/410 from the EMR -> "no such doctor here"
    }
  };

  return {
    list: async () => (await refs()).map(asDoctor),
    listRefs: refs,
    findRefById,
    listSpecialities: async () =>
      [...new Set((await refs()).map((d) => d.speciality))].sort((a, b) => a.localeCompare(b)),
    listBySpeciality: async (speciality: string) =>
      (await refs()).filter((d) => d.speciality.toLowerCase() === speciality.toLowerCase()),
    listNames: async () => (await refs()).map((d) => d.name),
    create: ROSTER_MANAGED,
    update: ROSTER_MANAGED,
    remove: ROSTER_MANAGED,
    getSchedule: ROSTER_MANAGED,
    setSchedule: ROSTER_MANAGED,
    getLeaves: ROSTER_MANAGED,
    addLeave: ROSTER_MANAGED,
    removeLeave: ROSTER_MANAGED
  };
};

const openEmrSlots = (client: FhirClient): SlotPort => {
  // Deliberately NO `status` filter: the presence of ANY slot that day is what
  // tells us the doctor is WORKING. Asking only for free slots collapses "not
  // working" and "fully booked" into the same empty answer, and the date picker
  // treats them differently (skip the day vs label it "Fully booked").
  const fetchDay = (doctorId: string, dateStr: string) =>
    client.search<FhirSlot>('Slot', {
      'schedule.actor': `Practitioner/${doctorId}`,
      start: [`ge${dateStr}`, `lt${nextDay(dateStr)}`]
    });

  // The EMR reports a slot free for the whole calendar day — it knows nothing of
  // our clinic-local "never offer a past or near-past slot" rule. nativeSlots
  // applies it, so this must too: otherwise at 15:30 IST the bot offers 09:00 AM
  // and createAppointment's isPastSlot guard then refuses to book it, dead-ending
  // the patient. Same slotMath the native adapter uses, so both agree exactly.
  const bookableFrom = (bundle: FhirBundle<FhirSlot>, dateStr: string, at: Date): string[] => {
    const now = clinicNow(at);
    return slotBundleToLabels(bundle).filter((label) => {
      const mins = labelToMinutes(label);
      return mins !== null && slotIsFuture(mins, dateStr, now);
    });
  };

  const getAvailable = async (doctorId: string, dateStr: string, at: Date = new Date()): Promise<string[]> =>
    bookableFrom(await fetchDay(doctorId, dateStr), dateStr, at);

  return {
    getAvailable,
    getDateAvailability: async (doctorId: string, dateStr: string) => {
      const bundle = await fetchDay(doctorId, dateStr);
      // Any slot at all => the doctor has a schedule that day and isn't on leave.
      const working = (bundle.entry?.length ?? 0) > 0;
      return { working, available: working ? bookableFrom(bundle, dateStr, new Date()).length : 0 };
    },
    isAvailable: async (doctorId: string, dateStr: string, time: string) => {
      const canonical = canonicalizeTime(time);
      return canonical !== null && (await getAvailable(doctorId, dateStr)).includes(canonical);
    }
  };
};

const openEmrPatients = (clinicId: string, client: FhirClient): PatientPort => {
  const searchByPhone = async (fragment: string): Promise<PatientRecord[]> => {
    const bundle = await client.search<FhirPatient>('Patient', { telecom: fragment });
    return patientBundleToRecords(bundle, clinicId);
  };

  const createFhirPatient = async (data: { name: string; phone: string }): Promise<PatientRecord> => {
    const created = await client.create<FhirPatient>('Patient', {
      resourceType: 'Patient',
      name: [{ text: data.name }],
      telecom: [{ system: 'phone', value: data.phone }]
    });
    return patientToRecord(created, clinicId);
  };

  return {
    list: async () => patientBundleToRecords(await client.search<FhirPatient>('Patient', {}), clinicId),
    findById: async (id: string) => {
      try {
        return patientToRecord(await client.read<FhirPatient>('Patient', id), clinicId);
      } catch {
        return null;
      }
    },
    findByPhone: async (phone: string) => {
      const matches = await searchByPhone(phone.trim());
      return matches.find((p) => p.phone === phone.trim()) ?? matches[0] ?? null;
    },
    findByPhoneContains: (fragment: string) => searchByPhone(fragment),
    listRecent: async () => patientBundleToRecords(await client.search<FhirPatient>('Patient', {}), clinicId),
    create: (data: PatientCreateData) => createFhirPatient({ name: data.name, phone: data.phone }),
    onboard: (data) => createFhirPatient({ name: data.name, phone: data.phone }),
    update: async (): Promise<never> => {
      throw new AppError('Patient updates for EMR-backed clinics are not supported yet.', 501);
    },
    remove: async (): Promise<never> => {
      throw new AppError('Patient deletion for EMR-backed clinics is not supported.', 400);
    }
  };
};

export const openEmrDataSource = (clinicId: string, client: FhirClient): ClinicDataSource => ({
  clinicId,
  doctors: openEmrDoctors(clinicId, client),
  slots: openEmrSlots(client),
  patients: openEmrPatients(clinicId, client)
});
