// Remove reminder rows that are NOT attached to a CONFIRMED appointment — these
// are residue from the prior bug (reminders were created for PENDING appts).
// Prints exactly what it deletes. Idempotent.
//   npx tsx scripts/purgeInvalidReminders.ts
import { AppointmentStatus } from '@prisma/client';
import { prisma } from '../src/config/prisma.js';

async function main() {
  const invalid = await prisma.reminder.findMany({
    where: { appointment: { status: { not: AppointmentStatus.CONFIRMED } } },
    include: { appointment: { include: { patient: { select: { name: true } } } } }
  });
  console.log(`Found ${invalid.length} reminder(s) on non-CONFIRMED appointments:`);
  for (const r of invalid) {
    console.log(`  DELETE ${r.type} → patient=${r.appointment.patient?.name} apptStatus=${r.appointment.status} apptId=${r.appointmentId}`);
  }
  if (invalid.length) {
    await prisma.reminder.deleteMany({ where: { id: { in: invalid.map((r) => r.id) } } });
    console.log('Deleted.');
  }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
