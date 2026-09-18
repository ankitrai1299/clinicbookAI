// Creates the UNIQUE indexes on the Razorpay columns.
//
// Prisma cannot apply these itself here: `prisma db push` is the deploy's
// preDeployCommand, and on this database it refuses to add a unique index — it
// reads it as possible data loss and stops, taking the whole deploy with it.
// So the schema declares plain columns and the constraint is applied as SQL.
//
// It is not decoration. The Razorpay webhook resolves a clinic by subscription
// id with no JWT and no tenant context; unique is what guarantees that lookup
// can only ever match one clinic, rather than letting one clinic's payment
// event change another clinic's plan.
//
// Idempotent — safe to re-run.
//
//   npx tsx scripts/applyRazorpayIndexes.ts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

(async () => {
  for (const column of ['razorpayCustomerId', 'razorpaySubscriptionId'] as const) {
    // A pre-existing duplicate makes CREATE UNIQUE INDEX fail with a message
    // about an index, which says nothing about the two clinics that actually
    // share a Razorpay id. Name the problem instead.
    const dupes = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM (
         SELECT 1 FROM "Clinic"
         WHERE "${column}" IS NOT NULL
         GROUP BY "${column}" HAVING COUNT(*) > 1
       ) d`,
    );
    if (dupes[0] && Number(dupes[0].count) > 0) {
      throw new Error(
        `${dupes[0].count} clinic group(s) share a ${column}. Resolve them before applying the unique index.`,
      );
    }

    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "Clinic_${column}_key" ON "Clinic" ("${column}")`,
    );
    console.log(`Applied unique index "Clinic_${column}_key".`);
  }
  await prisma.$disconnect();
})().catch((e) => {
  console.error('Failed to apply Razorpay indexes:', e);
  process.exit(1);
});
