// ===========================================================================
// Appointment data-source PORT (ClinicBook product domain).
//
// Appointment is a ClinicBook concept (unlike Doctor/Slot/Patient which are core
// shared domains), so its data seam lives HERE in the product, not in core — the
// layering rule is "core never imports products". This interface isolates the
// raw persistence of appointments so a clinic whose bookings live in an external
// EMR (OpenEMR/Epic/Practo) can provide a different implementation, while the
// service keeps ALL orchestration (lifecycle guards, WhatsApp/dashboard
// notifications, cross-product events, waitlist recovery, post-visit workflow).
//
// The port speaks INTENT, not Prisma mechanics: create-if-slot-free (atomic),
// read current state, apply a field update optionally guarded by an expected
// status. The native adapter maps that onto the $transaction + partial unique
// index + P2002/P2025 semantics we use today; an EMR adapter maps it onto the
// EMR's own conflict/concurrency model.
// ===========================================================================

import type { Appointment, AppointmentStatus } from '@prisma/client';

// The fully-hydrated appointment the service and its callers work with (doctor +
// patient + clinic + reminders joined in). Kept here so the port and its
// implementations share one shape; re-exported from appointment.service for
// existing importers.
export type AppointmentRecord = Appointment & {
  doctor?: { id: string; name: string; speciality: string };
  patient?: { id: string; name: string; phone: string; language: string };
  clinic?: { id: string; name: string; plan: string };
  reminders?: Array<{ id: string; type: string; sent: boolean }>;
};

// Lightweight current-state read used by the write paths before they mutate.
export interface AppointmentState {
  status: AppointmentStatus;
  doctorId: string;
  patientId: string;
  appointmentDate: Date;
  appointmentTime: string;
}

// Normalised create payload (date already a Date, time already canonical).
export interface AppointmentCreateData {
  doctorId: string;
  patientId: string;
  appointmentDate: Date;
  appointmentTime: string;
  status: AppointmentStatus;
}

// Fields an update may set. Any subset; the service builds this from validated,
// normalised input. completedAt/completedBy accompany a COMPLETED transition.
export interface AppointmentUpdateData {
  doctorId?: string;
  patientId?: string;
  appointmentDate?: Date;
  appointmentTime?: string;
  status?: AppointmentStatus;
  completedAt?: Date;
  completedBy?: string;
}

// Sentinel returned by applyUpdate when an expectedStatus guard didn't match any
// row — i.e. a concurrent request already applied this exact transition. The
// service turns this into "return the current record, send no duplicate message".
export const LOST_RACE = 'lost' as const;
export type ApplyUpdateResult = AppointmentRecord | typeof LOST_RACE;

export interface AppointmentPort {
  /** Throw AppError(404) unless both the doctor and patient exist in this clinic. */
  assertRefs(doctorId: string, patientId: string): Promise<void>;

  /**
   * Atomically create an appointment IF the doctor/date/time slot is still free.
   * Validates the doctor and patient belong to the clinic. Throws AppError(404)
   * if either is missing, AppError(409) if the slot is already taken.
   */
  create(input: AppointmentCreateData): Promise<AppointmentRecord>;

  /** All appointments for the clinic, ordered by date then time (hydrated). */
  list(): Promise<AppointmentRecord[]>;

  /** Fully-hydrated appointment by id, or null if it doesn't exist here. */
  findFull(id: string): Promise<AppointmentRecord | null>;

  /** Lightweight current state by id, or null if missing. */
  findState(id: string): Promise<AppointmentState | null>;

  /**
   * Apply a field update. When `expectedStatus` is given, the update only
   * succeeds if the row is still in that status (concurrency guard); if it was
   * already changed, returns LOST_RACE instead of throwing. A slot collision
   * (moving onto a taken slot) throws AppError(409).
   */
  applyUpdate(
    id: string,
    data: AppointmentUpdateData,
    opts?: { expectedStatus?: AppointmentStatus }
  ): Promise<ApplyUpdateResult>;
}
