/**
 * Drop MediScribe roles that disagree with the ClinicBook account.
 *
 *   BACKFILL_DATABASE_URL="postgresql://..." npx tsx scripts/clearStaleScribeRoles.ts
 *   ...same, plus --apply
 *
 * `/me` used to persist the role derived from the ClinicBook session the first
 * time a user opened the scribe. That one write froze it: the stored value won
 * from then on, so an account that happened to be ADMIN that day still read
 * "Super Admin" long after the User table said CLINIC_ADMIN. Nothing an admin
 * did in ClinicBook could dislodge it.
 *
 * The freeze is fixed in routes/auth.ts. This clears what it already left
 * behind.
 *
 * The rule: where the two disagree, the ClinicBook role wins, and the stored one
 * is REMOVED rather than overwritten — so the user falls through to the
 * ClinicBook role on every request, which is current by definition. A stored
 * role then means one thing only: an admin deliberately assigned it.
 *
 * Rows where the two already agree are left alone. So are any whose ClinicBook
 * account no longer exists — deleting the last trace of a departed user is not
 * this script's job.
 */

import { PrismaClient } from '@prisma/client';

import { platformRoleOf } from '../src/core/authz/index.js';

const APPLY = process.argv.includes('--apply');

const url = process.env.BACKFILL_DATABASE_URL;
if (!url) {
  console.error(
    '\nBACKFILL_DATABASE_URL is required — this script will not guess which database to touch.\n'
  );
  process.exit(1);
}

const prisma = new PrismaClient({ datasourceUrl: url });

const main = async () => {
  console.log(`\ndatabase: ${url.replace(/:\/\/[^@]*@/, '://***@')}`);
  console.log(APPLY ? '\n=== APPLYING ===\n' : '\n=== DRY RUN — nothing will be changed ===\n');

  const rows = await prisma.novaDoc.findMany({
    where: { collection: 'users' },
    select: { clinicId: true, collection: true, id: true, data: true }
  });

  const stale: Array<{ row: (typeof rows)[number]; stored: string; real: string; email: string }> = [];
  let agreed = 0;
  let orphaned = 0;

  for (const row of rows) {
    const data = (row.data ?? {}) as Record<string, unknown>;
    const stored = typeof data.role === 'string' ? data.role : null;
    if (!stored) continue;

    const account = await prisma.user.findUnique({
      where: { id: row.id },
      select: { role: true, email: true }
    });
    if (!account) {
      orphaned++;
      continue;
    }

    const real = platformRoleOf(account.role);
    if (!real) continue; // a role this build does not know — leave it alone
    if (real === stored) {
      agreed++;
      continue;
    }
    stale.push({ row, stored, real, email: account.email });
  }

  console.log(`rows examined: ${rows.length}   already in agreement: ${agreed}   no such account: ${orphaned}`);
  console.log(`\nStored roles to REMOVE (the ClinicBook role takes over): ${stale.length}`);
  for (const s of stale) {
    console.log(`  ${s.email.padEnd(34)} stored "${s.stored}"  →  will read "${s.real}" from ClinicBook`);
  }

  if (!stale.length) {
    console.log('\nNothing to do.\n');
    return;
  }

  if (!APPLY) {
    console.log('\nNothing was changed. Re-run with --apply.\n');
    console.log('To undo afterwards: assign the role again in MediScribe → Admin → Roles & Users.\n');
    return;
  }

  for (const s of stale) {
    const { role: _dropped, ...rest } = (s.row.data ?? {}) as Record<string, unknown>;
    await prisma.novaDoc.update({
      where: {
        clinicId_collection_id: {
          clinicId: s.row.clinicId,
          collection: s.row.collection,
          id: s.row.id
        }
      },
      // The whole object, minus `role`. An upsert through the repository would
      // shallow-MERGE and leave the key in place — removing it needs a full write.
      data: { data: rest }
    });
    console.log(`  cleared ${s.email}`);
  }

  console.log(`\nDone. Removed ${stale.length} stale role(s).\n`);
};

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
