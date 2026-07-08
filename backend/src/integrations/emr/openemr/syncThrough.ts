// syncThrough — wraps a RAW external-EMR ClinicDataSource (which speaks the EMR's
// own ids) and returns a ClinicDataSource that the rest of the app can use with
// LOCAL ids. On every resolve it upserts a local shadow row (see shadowSync) and
// links ids, so:
//   • doctors/patients come back with LOCAL ids (booking, "my appointments",
//     dashboard, reminders all keep using local ids + local relations),
//   • slots translate the local doctor id back to the EMR id before querying,
//   • local reads (findById/list) serve the shadow rows directly (fast, and the
//     mirror the whole app already understands).
// The EMR stays the source of truth for availability + (Phase 4) appointments;
// the local DB is a synced working mirror.

import { nativeDoctors } from '../../../core/datasource/native/nativeDoctors.js';
import { nativePatients } from '../../../core/datasource/native/nativePatients.js';
import type { ClinicDataSource, DoctorPort, SlotPort, PatientPort } from '../../../core/datasource/ports.js';
import { toExternal } from '../externalIdMap.service.js';
import { ensureShadowDoctor, ensureShadowPatient } from './shadowSync.js';

const syncDoctors = (clinicId: string, system: string, raw: DoctorPort): DoctorPort => {
  const local = nativeDoctors(clinicId);
  const shadowRefs = async () => {
    const refs = await raw.listRefs();
    return Promise.all(
      refs.map(async (r) => ({ ...r, id: await ensureShadowDoctor(clinicId, system, r) }))
    );
  };
  return {
    listRefs: shadowRefs,
    // Callers hold a LOCAL id, so serve it from the local shadow row — no EMR
    // round-trip and no roster-wide shadow upsert just to validate one doctor.
    findRefById: (localId: string) => local.findRefById(localId),
    list: async () => {
      await shadowRefs(); // ensure shadows exist, then serve local rows
      return local.list();
    },
    listSpecialities: () => raw.listSpecialities(),
    listBySpeciality: async (speciality: string) => {
      const refs = await raw.listBySpeciality(speciality);
      return Promise.all(refs.map(async (r) => ({ ...r, id: await ensureShadowDoctor(clinicId, system, r) })));
    },
    listNames: () => raw.listNames(),
    // Roster writes stay the EMR's job — delegate to raw (which rejects them).
    create: raw.create,
    update: raw.update,
    remove: raw.remove,
    getSchedule: raw.getSchedule,
    setSchedule: raw.setSchedule,
    getLeaves: raw.getLeaves,
    addLeave: raw.addLeave,
    removeLeave: raw.removeLeave
  };
};

const syncSlots = (clinicId: string, system: string, raw: SlotPort): SlotPort => {
  const emrDoctor = (localDoctorId: string) => toExternal(clinicId, system, 'doctor', localDoctorId);
  return {
    getAvailable: async (localDoctorId, dateStr, at) => {
      const emrId = await emrDoctor(localDoctorId);
      return emrId ? raw.getAvailable(emrId, dateStr, at) : [];
    },
    getDateAvailability: async (localDoctorId, dateStr) => {
      const emrId = await emrDoctor(localDoctorId);
      return emrId ? raw.getDateAvailability(emrId, dateStr) : { working: false, available: 0 };
    },
    isAvailable: async (localDoctorId, dateStr, time) => {
      const emrId = await emrDoctor(localDoctorId);
      return emrId ? raw.isAvailable(emrId, dateStr, time) : false;
    }
  };
};

const syncPatients = (clinicId: string, system: string, raw: PatientPort): PatientPort => {
  const local = nativePatients(clinicId);
  const shadowToLocal = async (rec: Awaited<ReturnType<PatientPort['findByPhone']>>) => {
    if (!rec) return null;
    const localId = await ensureShadowPatient(clinicId, system, rec);
    return local.findById(localId);
  };
  return {
    // EMR-resolving reads: query the EMR, shadow, return the LOCAL record.
    findByPhone: async (phone) => shadowToLocal(await raw.findByPhone(phone)),
    findByPhoneContains: async (fragment) => {
      const recs = await raw.findByPhoneContains(fragment);
      const out = await Promise.all(recs.map((r) => shadowToLocal(r)));
      return out.filter((p): p is NonNullable<typeof p> => p != null);
    },
    // Writes create in the EMR first, then shadow.
    create: async (data) => {
      const created = await raw.create(data);
      const localId = await ensureShadowPatient(clinicId, system, created);
      return (await local.findById(localId))!;
    },
    onboard: async (data) => {
      const created = await raw.onboard(data);
      const localId = await ensureShadowPatient(clinicId, system, created);
      return (await local.findById(localId))!;
    },
    // Local-mirror reads (fast; the shadow rows the whole app already understands).
    list: () => local.list(),
    listRecent: () => local.listRecent(),
    findById: (id) => local.findById(id),
    update: (id, data) => local.update(id, data),
    remove: (id) => local.remove(id)
  };
};

export const syncThroughDataSource = (
  clinicId: string,
  system: string,
  raw: ClinicDataSource
): ClinicDataSource => ({
  clinicId,
  doctors: syncDoctors(clinicId, system, raw.doctors),
  slots: syncSlots(clinicId, system, raw.slots),
  patients: syncPatients(clinicId, system, raw.patients)
});
