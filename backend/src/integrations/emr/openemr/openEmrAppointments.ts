// OpenEMR (FHIR) AppointmentPort — the Phase 4 WRITE path. The EMR is the source
// of truth for bookings; the local Appointment table is a synced mirror that
// keeps reminders / analytics / dashboard / "my appointments" working unchanged.
//
// The `mirror` (native AppointmentPort) is injected, so this composes over the
// exact same tested local write path and its atomic slot-lock. Everything the app
// hands us uses LOCAL ids; we translate to the EMR's ids via ExternalIdMap.
//
//   create      → EMR Appointment POST (source of truth) → mirror locally → link ids
//   reschedule  → mirror.applyUpdate (local concurrency guard) → push new state to EMR
//   cancel/…    → same applyUpdate path (service calls applyUpdate for all writes)
//   reads       → served from the local mirror

import { AppError } from '../../../utils/AppError.js';
import type {
  AppointmentPort,
  AppointmentRecord,
  AppointmentCreateData,
  AppointmentUpdateData,
  ApplyUpdateResult
} from '../../../products/clinicbook/appointments/appointment.port.js';
import { LOST_RACE } from '../../../products/clinicbook/appointments/appointment.port.js';
import type { AppointmentStatus } from '@prisma/client';
import type { FhirClient } from '../fhir/fhirClient.js';
import type { FhirAppointment } from '../fhir/types.js';
import { appointmentToFhir } from '../fhir/mappers.js';
import { link, toExternal } from '../externalIdMap.service.js';

export const openEmrAppointments = (
  clinicId: string,
  system: string,
  client: FhirClient,
  mirror: AppointmentPort
): AppointmentPort => {
  const emrRefs = (doctorLocalId: string, patientLocalId: string) =>
    Promise.all([
      toExternal(clinicId, system, 'doctor', doctorLocalId),
      toExternal(clinicId, system, 'patient', patientLocalId)
    ]);

  const create = async (input: AppointmentCreateData): Promise<AppointmentRecord> => {
    const [emrDoctorId, emrPatientId] = await emrRefs(input.doctorId, input.patientId);
    if (!emrDoctorId || !emrPatientId) {
      throw new AppError('Doctor or patient is not linked to the EMR yet.', 409);
    }

    // Source of truth: create in the EMR first. A conflict there (slot taken)
    // surfaces as an error we translate to a clean 409 upstream.
    const fhir = await client.create<FhirAppointment>(
      'Appointment',
      appointmentToFhir({
        status: input.status,
        appointmentDate: input.appointmentDate,
        appointmentTime: input.appointmentTime,
        emrDoctorId,
        emrPatientId
      })
    );

    // Mirror locally (reuses the native atomic slot-lock + hydration), link ids.
    const local = await mirror.create(input);
    if (fhir.id) await link(clinicId, system, 'appointment', local.id, fhir.id);
    return local;
  };

  // Reflect a locally-applied change (reschedule / cancel / confirm / complete)
  // into the EMR. Best-effort: the local mirror already succeeded and may have
  // messaged the patient, so an EMR hiccup is logged, not thrown (retry/reconcile
  // later) — the app keeps working on the mirror.
  const pushUpdateToEmr = async (record: AppointmentRecord): Promise<void> => {
    const externalApptId = await toExternal(clinicId, system, 'appointment', record.id);
    if (!externalApptId) return; // not an EMR-created appointment / unmapped
    const [emrDoctorId, emrPatientId] = await emrRefs(record.doctorId, record.patientId);
    if (!emrDoctorId || !emrPatientId) return;
    try {
      const body = appointmentToFhir({
        status: record.status,
        appointmentDate: record.appointmentDate,
        appointmentTime: record.appointmentTime,
        emrDoctorId,
        emrPatientId
      });
      await client.update<FhirAppointment>('Appointment', externalApptId, { ...body, id: externalApptId });
    } catch (err) {
      console.error(`[emr] failed to push appointment ${record.id} update to EMR:`, err);
    }
  };

  const applyUpdate = async (
    id: string,
    data: AppointmentUpdateData,
    opts?: { expectedStatus?: AppointmentStatus }
  ): Promise<ApplyUpdateResult> => {
    const result = await mirror.applyUpdate(id, data, opts);
    if (result !== LOST_RACE) await pushUpdateToEmr(result);
    return result;
  };

  return {
    assertRefs: (doctorId, patientId) => mirror.assertRefs(doctorId, patientId),
    create,
    list: () => mirror.list(),
    findFull: (id) => mirror.findFull(id),
    findState: (id) => mirror.findState(id),
    applyUpdate
  };
};
