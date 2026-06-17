// Creates the PARTIAL unique index that hard-prevents double-booking at the DB
// level: at most one ACTIVE (non-cancelled) appointment per
// (clinicId, doctorId, appointmentDate, appointmentTime). Prisma can't express a
// partial unique index, so we apply it as raw SQL. Idempotent — safe to re-run.
//
//   npx tsx scripts/applySlotUniqueIndex.ts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

(async () => {
  // Guard: a pre-existing duplicate active slot would make index creation fail.
  // Surface it clearly instead of letting Postgres throw a cryptic error.
  const dupes = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*)::bigint AS count FROM (
       SELECT 1 FROM "Appointment"
       WHERE status <> 'CANCELLED'
       GROUP BY "clinicId", "doctorId", "appointmentDate", "appointmentTime"
       HAVING COUNT(*) > 1
     ) d`
  );
  if (dupes[0] && Number(dupes[0].count) > 0) {
    throw new Error(
      `Found ${dupes[0].count} duplicate active slot group(s). Resolve them before applying the unique index.`
    );
  }

  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "Appointment_active_slot_key"
       ON "Appointment" ("clinicId", "doctorId", "appointmentDate", "appointmentTime")
       WHERE status <> 'CANCELLED'`
  );

  console.log('Applied partial unique index "Appointment_active_slot_key".');
  await prisma.$disconnect();
})().catch((e) => {
  console.error('Failed to apply slot unique index:', e);
  process.exit(1);
});
