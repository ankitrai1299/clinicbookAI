// ExternalIdMap service — translates between ClinicBook LOCAL ids and an external
// EMR's ids, per clinic + system + entity. The EMR adapters use this so the rest
// of the app only ever handles local ids; the EMR's ids stay confined to the
// integration layer. Clinic-scoped through forClinic (ExternalIdMap is in
// TENANT_MODELS), so one clinic can never read/overwrite another's mapping.

import { forClinic } from '../../config/tenantPrisma.js';

export type ExternalEntity = 'patient' | 'doctor' | 'appointment';

// Idempotently record local ↔ external for one entity. Safe to call repeatedly
// (e.g. every time a patient is resolved): upserts on the (clinic, system,
// entity, localId) unique key, refreshing the externalId.
export const link = async (
  clinicId: string,
  system: string,
  entity: ExternalEntity,
  localId: string,
  externalId: string
): Promise<void> => {
  const db = forClinic(clinicId);
  await db.externalIdMap.upsert({
    where: { clinicId_system_entity_localId: { clinicId, system, entity, localId } },
    update: { externalId },
    create: { clinicId, system, entity, localId, externalId }
  });
};

// The EMR's id for a local entity, or null if unmapped.
export const toExternal = async (
  clinicId: string,
  system: string,
  entity: ExternalEntity,
  localId: string
): Promise<string | null> => {
  const row = await forClinic(clinicId).externalIdMap.findUnique({
    where: { clinicId_system_entity_localId: { clinicId, system, entity, localId } },
    select: { externalId: true }
  });
  return row?.externalId ?? null;
};

// Our local id for an EMR entity, or null if unmapped.
export const toLocal = async (
  clinicId: string,
  system: string,
  entity: ExternalEntity,
  externalId: string
): Promise<string | null> => {
  const row = await forClinic(clinicId).externalIdMap.findUnique({
    where: { clinicId_system_entity_externalId: { clinicId, system, entity, externalId } },
    select: { localId: true }
  });
  return row?.localId ?? null;
};
