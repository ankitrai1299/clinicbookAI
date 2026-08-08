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
  patient?: { id: string; name: string; phone: string | null; language: string };
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

/**
 * Narrowing for list(). Every field is optional and omitting all of them keeps
 * the original "everything for this clinic" behaviour.
 *
 * It exists because callers were fetching a clinic's ENTIRE appointment history —
 * with the patient and doctor joined onto every row — and then discarding all but
 * a handful in JavaScript. That is invisible on a clinic with four appointments
 * and ruinous on one with a year of them, which is exactly the shape that only
 * shows up once there are real clinics on the platform. Pushing the filter into
 * the query also lets Postgres use the composite
 * (clinicId, appointmentDate, appointmentTime) index that already exists.
 */
export interface AppointmentListFilter {
  /** Clinic-local YYYY-MM-DD — only appointments on or after this day. */
  fromDate?: string;
  /** Clinic-local YYYY-MM-DD — only appointments on or before this day. */
  toDate?: string;
  /** Only these statuses (e.g. the live ones). */
  statuses?: AppointmentStatus[];
  doctorId?: string;
  patientId?: string;
  /** Hard cap on rows returned. */
  limit?: number;
}

export interface AppointmentPort {
  /** Throw AppError(404) unless both the doctor and patient exist in this clinic. */
  assertRefs(doctorId: string, patientId: string): Promise<void>;

  /**
   * Atomically create an appointment IF the doctor/date/time slot is still free.
   * Throws AppError(409) if the slot is already taken. The caller (the service)
   * has already run assertRefs(), so implementations must NOT re-validate the
   * doctor/patient — that keeps 404-before-400 precedence in one place.
   */
  create(input: AppointmentCreateData): Promise<AppointmentRecord>;

  /**
   * Appointments for the clinic, ordered by date then time (hydrated).
   * Narrow with `filter` — omitting it returns everything, as before.
   */
  list(filter?: AppointmentListFilter): Promise<AppointmentRecord[]>;

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
