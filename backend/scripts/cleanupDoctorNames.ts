// One-off data fix: normalize the clinic's dirty doctor names to canonical
// display form. Idempotent and safe to re-run. Prints before → after.
//   npx tsx scripts/cleanupDoctorNames.ts
import { prisma } from '../src/config/prisma.js';
import { formatDoctorName } from '../src/utils/doctorName.js';

// Explicit canonical forms where the raw value is genuinely ambiguous (dotted
// initials the auto-formatter can't reconstruct). Keyed by lowercased current
// name. Anything not listed falls back to formatDoctorName().
const CANONICAL: Record<string, string> = {
  'dr a.k das': 'Dr. A.K. Das'
};

async function main() {
  const docs = await prisma.doctor.findMany({ select: { id: true, name: true } });
  for (const d of docs) {
    const target = CANONICAL[d.name.trim().toLowerCase()] ?? formatDoctorName(d.name);
    if (target !== d.name) {
      await prisma.doctor.update({ where: { id: d.id }, data: { name: target } });
      console.log(`UPDATED  "${d.name}"  →  "${target}"`);
    } else {
      console.log(`UNCHANGED "${d.name}"`);
    }
  }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
