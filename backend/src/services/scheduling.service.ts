// Scheduling service. The PURE slot/time math now lives in ./slotMath and is
// re-exported here so every existing importer (canonicalizeTime, isPastSlot,
// clinicNow, clinicLocalInstant, …) is unaffected. The three DATABASE-backed
// functions below are now thin dispatchers to the clinic's data source: native
// (Prisma) today, an EMR adapter later — no caller changes when a clinic's slots
// come from an external HMIS instead of our tables.

import { dataSourceFor } from '../core/datasource/index.js';

// Re-export all pure helpers (parseHHMM, formatSlot, clinicNow, slotIsFuture,
// canonicalizeTime, isPastSlot, clinicLocalInstant, CLINIC_TIMEZONE, …).
export * from './slotMath.js';

/**
 * Available appointment start times for a doctor on a given date (YYYY-MM-DD).
 * Returns [] if the doctor has no active schedule that weekday, is on leave,
 * or every slot is taken.
 */
export const getAvailableSlots = (
  clinicId: string,
  doctorId: string,
  dateStr: string,
  at: Date = new Date()
): Promise<string[]> => dataSourceFor(clinicId).slots.getAvailable(doctorId, dateStr, at);

/**
 * One day's availability summary for a doctor — used by the date picker.
 *   working   = the doctor has an active schedule that weekday AND isn't on leave
 *   available = number of still-open slots (0 when fully booked)
 */
export const getDateAvailability = (
  clinicId: string,
  doctorId: string,
  dateStr: string
): Promise<{ working: boolean; available: number }> =>
  dataSourceFor(clinicId).slots.getDateAvailability(doctorId, dateStr);

/** Whether a specific time string is currently bookable for that doctor/date. */
export const isSlotAvailable = (
  clinicId: string,
  doctorId: string,
  dateStr: string,
  time: string
): Promise<boolean> => dataSourceFor(clinicId).slots.isAvailable(doctorId, dateStr, time);
