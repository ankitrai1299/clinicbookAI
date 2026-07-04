// Assembles the NATIVE (Prisma/Postgres) ClinicDataSource for a clinic. This is
// the default source: it reproduces the app's current behaviour exactly. Each
// sub-port is a thin, tested wrapper over the clinic-scoped Prisma client.
//
// As more domains are migrated behind the seam, add their native adapter here
// (slots, appointments, patients, waitlist) — the shape must satisfy
// ClinicDataSource.

import type { ClinicDataSource } from '../ports.js';
import { nativeDoctors } from './nativeDoctors.js';
import { nativeSlots } from './nativeSlots.js';
import { nativePatients } from './nativePatients.js';

export const nativeDataSource = (clinicId: string): ClinicDataSource => ({
  clinicId,
  doctors: nativeDoctors(clinicId),
  slots: nativeSlots(clinicId),
  patients: nativePatients(clinicId)
});
