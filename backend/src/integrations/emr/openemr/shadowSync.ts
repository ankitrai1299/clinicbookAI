// Shadow-sync helpers for the "local mirror" model (Phase 4). For an EMR-backed
// clinic the local DB is a full working mirror and the EMR is the sync source of
// truth. When we resolve an EMR doctor/patient we upsert a LOCAL shadow row and
// link ids (ExternalIdMap), then hand the rest of the app the LOCAL id. That
// keeps reminders, analytics, dashboard and "my appointments" working unchanged
// (they read local rows with real relations) while writes still flow to the EMR.

import { forClinic } from '../../../config/tenantPrisma.js';
import type { DoctorRef, PatientRecord } from '../../../core/datasource/ports.js';
import { link, toLocal } from '../externalIdMap.service.js';

// EMR doctor → local shadow Doctor id. Idempotent: re-linking refreshes the
// shadow's name/speciality so the mirror tracks the EMR.
export const ensureShadowDoctor = async (
  clinicId: string,
  system: string,
  emr: DoctorRef
): Promise<string> => {
  const db = forClinic(clinicId);
  const existingLocal = await toLocal(clinicId, system, 'doctor', emr.id);
  if (existingLocal) {
    await db.doctor.updateMany({
      where: { id: existingLocal, clinicId },
      data: { name: emr.name, speciality: emr.speciality }
    });
    return existingLocal;
  }
  const created = await db.doctor.create({
    data: { clinicId, name: emr.name, speciality: emr.speciality }
  });
  await link(clinicId, system, 'doctor', created.id, emr.id);
  return created.id;
};

// EMR patient → local shadow Patient id. Reuses an existing local row with the
// same phone (never duplicates a human), otherwise creates one, then links.
export const ensureShadowPatient = async (
  clinicId: string,
  system: string,
  emr: PatientRecord
): Promise<string> => {
  const db = forClinic(clinicId);
  const externalId = emr.id;

  const existingLocal = await toLocal(clinicId, system, 'patient', externalId);
  if (existingLocal) {
    await db.patient.updateMany({
      where: { id: existingLocal, clinicId },
      data: { name: emr.name, phone: emr.phone }
    });
    return existingLocal;
  }

  // A local patient with this phone may already exist (e.g. onboarded natively
  // before the clinic moved to EMR) — reuse it rather than duplicate the human.
  const byPhone = emr.phone
    ? await db.patient.findUnique({
        where: { clinicId_phone: { clinicId, phone: emr.phone } },
        select: { id: true }
      })
    : null;

  const localId =
    byPhone?.id ??
    (
      await db.patient.create({
        data: {
          clinicId,
          name: emr.name,
          phone: emr.phone,
          language: emr.language || 'English',
          source: 'emr',
          ...(emr.gender ? { gender: emr.gender } : {})
        },
        select: { id: true }
      })
    ).id;

  await link(clinicId, system, 'patient', localId, externalId);
  return localId;
};
