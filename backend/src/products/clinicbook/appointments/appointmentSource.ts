// Resolver for a clinic's appointment data source. Mirrors core's dataSourceFor:
// trivial now (always native/Prisma), config-driven later. Phase 2 will return
// an EMR-backed AppointmentPort for clinics whose bookings live in an external
// HMIS — the appointment.service never changes.

import type { AppointmentPort } from './appointment.port.js';
import { nativeAppointments } from './appointment.native.js';

export const appointmentSourceFor = (clinicId: string): AppointmentPort => {
  // TODO(Phase 2): honour clinic.dataSource; EMR clinics get an EMR adapter that
  // writes to the HMIS (source of truth) and the service mirrors locally.
  return nativeAppointments(clinicId);
};
