// Assembles the NATIVE (Prisma/Postgres) ClinicDataSource for a clinic. This is
// the default source: it reproduces the app's current behaviour exactly. Each
// sub-port is a thin, tested wrapper over the clinic-scoped Prisma client.
//
// Memoized per clinic: `dataSourceFor` is called on every seam read, and the
// WhatsApp FSM walks it ~30x per inbound message (21-day slot scan + date
// picker). The sub-ports close over nothing but clinicId and the (already
// memoized) scoped client, so one instance per clinic is safe for the process
// lifetime and bounded by the number of clinics.
//
// As more domains are migrated behind the seam, add their native adapter here
// (appointments, waitlist) — the shape must satisfy ClinicDataSource.

import type { ClinicDataSource } from '../ports.js';
import { nativeDoctors } from './nativeDoctors.js';
import { nativeSlots } from './nativeSlots.js';
import { nativePatients } from './nativePatients.js';

const cache = new Map<string, ClinicDataSource>();

export const nativeDataSource = (clinicId: string): ClinicDataSource => {
  const cached = cache.get(clinicId);
  if (cached) return cached;

  const source: ClinicDataSource = {
    clinicId,
    doctors: nativeDoctors(clinicId),
    slots: nativeSlots(clinicId),
    patients: nativePatients(clinicId)
  };
  cache.set(clinicId, source);
  return source;
};
