import { prisma } from './prisma.js';

// Hard DB-level guard against double-booking. At most one ACTIVE (non-cancelled)
// appointment may exist per (clinicId, doctorId, appointmentDate, appointmentTime).
//
// Prisma cannot express a PARTIAL unique index, so `prisma db push` never creates
// it — without this the only protection is the in-transaction re-check in
// createAppointment(), which is not a true lock and races under concurrent
// bookings (e.g. WhatsApp + dashboard at the same instant). We therefore create
// the index here at startup. CREATE UNIQUE INDEX IF NOT EXISTS is idempotent, so
// this is safe to run on every boot.
//
// If pre-existing duplicate active slots already exist, the index cannot be
// created. We log a loud, actionable error and continue booting (the
// transaction re-check still provides best-effort protection) rather than
// crashing the whole service over historical data.
export const ensureSlotUniqueIndex = async (): Promise<void> => {
  try {
    const dupes = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM (
         SELECT 1 FROM "Appointment"
         WHERE status <> 'CANCELLED'
         GROUP BY "clinicId", "doctorId", "appointmentDate", "appointmentTime"
         HAVING COUNT(*) > 1
       ) d`
    );

    if (dupes[0] && Number(dupes[0].count) > 0) {
      console.error(
        `[DB] Cannot create "Appointment_active_slot_key": ${dupes[0].count} duplicate active slot group(s) exist. ` +
          'Resolve them (cancel/merge the duplicates), then restart so the double-booking guard can be applied.'
      );
      return;
    }

    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "Appointment_active_slot_key"
         ON "Appointment" ("clinicId", "doctorId", "appointmentDate", "appointmentTime")
         WHERE status <> 'CANCELLED'`
    );

    console.info('[DB] Double-booking guard ensured (Appointment_active_slot_key).');
  } catch (err) {
    console.error('[DB] Failed to ensure slot unique index — double-booking protection may be degraded:', err);
  }
};
