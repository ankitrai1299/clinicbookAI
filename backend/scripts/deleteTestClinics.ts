// Delete clinics EXCEPT the ones named in KEEP_CLINIC_IDS (comma-separated).
//
// Irreversible. The schema cascades from Clinic, so a clinic's users, patients,
// appointments, notes and WhatsApp rows go with it.
//
// Written to be loud rather than clever: it prints who it is keeping, names
// each clinic and its contents as it deletes, and STOPS on the first failure
// instead of half-finishing. It refuses to run without both an explicit keep
// list and COMMIT=yes, so it cannot go off by accident.
//
//   KEEP_CLINIC_IDS="id1,id2" COMMIT=yes \
//     railway run npx tsx scripts/deleteTestClinics.ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const KEEP = (process.env.KEEP_CLINIC_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
if (!KEEP.length) throw new Error('KEEP_CLINIC_IDS is required — refusing to run without one.');
if (process.env.COMMIT !== 'yes') throw new Error('Set COMMIT=yes to actually delete.');

(async () => {
  const keepers = await prisma.clinic.findMany({ where: { id: { in: KEEP } }, select: { id: true, name: true } });
  if (keepers.length !== KEEP.length) {
    const found = new Set(keepers.map((k) => k.id));
    throw new Error(`These ids do not exist: ${KEEP.filter((k) => !found.has(k)).join(', ')}. Nothing deleted.`);
  }
  console.log('Keeping:');
  for (const k of keepers) console.log(`  ${k.name}  (${k.id})`);

  const doomed = await prisma.clinic.findMany({
    where: { id: { notIn: KEEP } },
    select: { id: true, name: true, email: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!doomed.length) { console.log('\nNothing else to delete.'); return; }
  console.log('');

  let ok = 0;
  for (const c of doomed) {
    const [users, patients, appts] = await Promise.all([
      prisma.user.count({ where: { clinicId: c.id } }),
      prisma.patient.count({ where: { clinicId: c.id } }),
      prisma.appointment.count({ where: { clinicId: c.id } }),
    ]);
    process.stdout.write(`Deleting ${c.name} <${c.email}> — ${users} users, ${patients} patients, ${appts} appointments … `);
    try {
      await prisma.clinic.delete({ where: { id: c.id } });
      console.log('done');
      ok++;
    } catch (e: any) {
      console.log('FAILED');
      console.error(`  ${String(e.message).split('\n')[0]}`);
      console.error('  Stopping here — the rest are untouched.');
      break;
    }
  }

  const left = await prisma.clinic.findMany({ select: { name: true }, orderBy: { name: 'asc' } });
  console.log(`\nDeleted ${ok} of ${doomed.length}. Remaining: ${left.map((c) => c.name).join(', ')}`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
