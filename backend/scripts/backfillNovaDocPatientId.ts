// Repair NovaDoc.patientId — the denormalised copy of data.patientId.
//
// NovaDoc keeps patientId as a real column so patient-scoped reads can use the
// (clinicId, collection, patientId) index instead of loading a clinic's whole
// collection and filtering in JS. Rows written before that column existed have
// it NULL while their JSON carries a real patientId.
//
// That is not cosmetic. autoCompleteVisits queries the COLUMN, so a consultation
// with a null column is invisible to it: the doctor finalized a note and the
// appointment never closed itself. Patient history still finds those rows,
// because it filters the JSON in JS — which is exactly the inconsistency that
// makes pushing that filter down into SQL unsafe until this is fixed.
//
// Only ever fills a NULL from the row's own JSON. Never overwrites a value,
// never invents one, and re-running it is a no-op.
//
//   npx tsx scripts/backfillNovaDocPatientId.ts          # dry run, prints only
//   npx tsx scripts/backfillNovaDocPatientId.ts --apply  # writes

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const run = async (): Promise<void> => {
  const rows = await prisma.novaDoc.findMany({
    where: { patientId: null },
    select: { clinicId: true, collection: true, id: true, data: true }
  });

  const fixable = rows
    .map((r) => {
      const fromJson = (r.data as { patientId?: unknown } | null)?.patientId;
      return typeof fromJson === 'string' && fromJson.trim() ? { ...r, patientId: fromJson.trim() } : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  console.log(`NovaDoc rows with a NULL patientId column: ${rows.length}`);
  console.log(`  ...of which the JSON supplies one:       ${fixable.length}`);

  for (const r of fixable) {
    console.log(`  ${r.collection}/${r.id} → ${r.patientId}`);
  }

  if (!fixable.length) {
    console.log('Nothing to do.');
    return;
  }

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to write.');
    return;
  }

  let done = 0;
  for (const r of fixable) {
    // Guard on patientId: null so a concurrent write that already set it wins,
    // rather than this script overwriting a fresher value.
    const res = await prisma.novaDoc.updateMany({
      where: { clinicId: r.clinicId, collection: r.collection, id: r.id, patientId: null },
      data: { patientId: r.patientId }
    });
    done += res.count;
  }
  console.log(`\nUpdated ${done} row(s).`);
};

run()
  .catch((err) => {
    console.error('[backfill] failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
