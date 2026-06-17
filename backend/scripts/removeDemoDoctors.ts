// One-off cleanup: remove the 4 seed/demo doctors that the old signup flow
// auto-created in every new clinic. Run with `npx tsx scripts/removeDemoDoctors.ts`
// from the backend/ dir. Pass `--apply` to actually delete; default is a dry run.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_NAMES = [
  'Dr. Sarah Jenkins',
  'Dr. Amit Patel',
  'Dr. Clara Oswald',
  'Dr. Marcus Vance',
];

const apply = process.argv.includes('--apply');

async function main() {
  const doctors = await prisma.doctor.findMany({
    where: { name: { in: DEMO_NAMES } },
    include: {
      clinic: { select: { name: true } },
      _count: { select: { appointments: true, schedules: true, leaves: true } },
    },
    orderBy: { name: 'asc' },
  });

  if (doctors.length === 0) {
    console.log('No demo doctors found. Nothing to remove.');
    return;
  }

  console.log(`Found ${doctors.length} demo doctor(s):`);
  for (const d of doctors) {
    console.log(
      `  - ${d.name} (${d.speciality || 'n/a'}) | clinic="${d.clinic.name}" clinicId=${d.clinicId} | ` +
        `appts=${d._count.appointments} schedules=${d._count.schedules} leaves=${d._count.leaves} | id=${d.id}`
    );
  }

  if (!apply) {
    console.log('\nDRY RUN — no changes made. Re-run with --apply to delete.');
    return;
  }

  const ids = doctors.map((d) => d.id);
  const result = await prisma.$transaction(async (tx) => {
    // Appointment -> Doctor has no cascade; remove those rows first so the
    // doctor delete cannot fail on a foreign-key restrict. Schedules and
    // leaves cascade automatically on doctor delete.
    const appts = await tx.appointment.deleteMany({ where: { doctorId: { in: ids } } });
    const docs = await tx.doctor.deleteMany({ where: { id: { in: ids } } });
    return { appts: appts.count, docs: docs.count };
  });

  console.log(
    `\nDeleted ${result.docs} demo doctor(s) and ${result.appts} related appointment(s).`
  );
}

main()
  .catch((e) => {
    console.error('Cleanup failed:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
