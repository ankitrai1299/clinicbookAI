/**
 * Move existing doctors onto the real DOCTOR role, and link their accounts.
 *
 *   npm run doctors:backfill          → prints what it WOULD change, changes nothing
 *   npm run doctors:backfill -- --apply
 *
 * Why this is needed: before the DOCTOR role existed, an admin creating a doctor
 * had to store the account as STAFF, because the enum had nothing better, and
 * the real role was kept separately in MediScribe's users collection. So today
 * there are accounts that ARE doctors and say "front-desk staff" in the token.
 *
 * Two fixes, both narrow:
 *
 *   1. Accounts whose stored MediScribe role is 'doctor'  →  UserRole.DOCTOR
 *   2. Doctor records with no `userId`                    →  linked by email
 *
 * Nothing else is touched. In particular an account whose stored role is NOT
 * 'doctor' is left exactly as it is — which is every admin in the system.
 *
 * Reversible: the report prints the previous role of every account it changes,
 * so putting one back is a single update.
 */

import { PrismaClient } from '@prisma/client';

import { clinicBookRoleOf } from '../src/core/authz/index.js';

const APPLY = process.argv.includes('--apply');

/**
 * WHICH database this runs against — stated explicitly, never inherited.
 *
 * The app's env loader reads `.env.local` with `override: true`, so it beats
 * even a real environment variable. A script importing the shared client would
 * therefore hit whatever `.env.local` points at — a local dev database — while
 * everything on screen looked correct. That is exactly what happened the first
 * time this was run: it reported "0 accounts to promote" against the wrong
 * database, which is the most dangerous possible answer, because it looks like
 * good news.
 *
 * So this builds its own client from a URL it is GIVEN, and refuses to guess.
 */
const url = process.env.BACKFILL_DATABASE_URL;
if (!url) {
  console.error(
    '\nBACKFILL_DATABASE_URL is required — this script will not guess which database to touch.\n\n' +
      '  BACKFILL_DATABASE_URL="postgresql://..." npm run doctors:backfill\n\n' +
      'Use the DIRECT (non-pooled) URL. Add `-- --apply` once the dry run looks right.\n'
  );
  process.exit(1);
}

const prisma = new PrismaClient({ datasourceUrl: url });

type Row = { clinicId: string; userId: string; email: string; was: string };

const main = async () => {
  // Say WHERE, before anything else. A run against the wrong database is the
  // failure this preamble exists to prevent, and showing the operator where they
  // are pointed is the only real defence.
  console.log(`\ndatabase: ${url.replace(/:\/\/[^@]*@/, '://***@')}`);
  console.log(APPLY ? '\n=== APPLYING ===\n' : '\n=== DRY RUN — nothing will be changed ===\n');

  // ── 1. Which accounts are really doctors? ──────────────────────────────────
  //
  // The answer lives in the scribe's own store, which is a NovaDoc collection
  // rather than a table — so this reads it directly instead of through the
  // repository, which needs a clinic bound in AsyncLocalStorage and this script
  // spans every clinic.
  const scribeUsers = await prisma.novaDoc.findMany({
    where: { collection: 'users' },
    select: { clinicId: true, id: true, data: true }
  });

  const doctorAccountIds = new Map<string, string>(); // userId → clinicId
  for (const row of scribeUsers) {
    const role = (row.data as { role?: string } | null)?.role;
    if (role === 'doctor') doctorAccountIds.set(row.id, row.clinicId);
  }
  console.log(`Scribe users with role 'doctor': ${doctorAccountIds.size}`);

  const toPromote: Row[] = [];
  if (doctorAccountIds.size) {
    const accounts = await prisma.user.findMany({
      where: { id: { in: [...doctorAccountIds.keys()] } },
      select: { id: true, clinicId: true, email: true, role: true }
    });
    const target = clinicBookRoleOf('doctor');
    for (const a of accounts) {
      if (a.role === target) continue; // already correct — say nothing
      toPromote.push({ clinicId: a.clinicId, userId: a.id, email: a.email, was: a.role });
    }
  }

  console.log(`\nAccounts to promote to DOCTOR: ${toPromote.length}`);
  for (const r of toPromote) console.log(`  ${r.email.padEnd(34)} ${r.was} → DOCTOR   (clinic ${r.clinicId})`);

  // ── 2. Doctor records with no link ────────────────────────────────────────
  //
  // Matched by email, which is the join that is being retired — this is the one
  // run where using it is correct, because it is what turns it into a key.
  const unlinked = await prisma.doctor.findMany({
    where: { userId: null, email: { not: null } },
    select: { id: true, clinicId: true, name: true, email: true }
  });

  const toLink: Array<{ doctorId: string; userId: string; name: string; email: string }> = [];
  const noAccount: Array<{ name: string; email: string }> = [];
  for (const d of unlinked) {
    const email = (d.email ?? '').toLowerCase().trim();
    if (!email) continue;
    const account = await prisma.user.findUnique({ where: { email }, select: { id: true, clinicId: true } });
    // Same clinic only. `User.email` is unique platform-wide, so an address that
    // belongs to another tenant would otherwise link a doctor here to a stranger
    // there — the exact cross-tenant mistake this whole change is closing.
    if (!account || account.clinicId !== d.clinicId) {
      noAccount.push({ name: d.name, email });
      continue;
    }
    // `Doctor.userId` is unique: if that account is already some other doctor's
    // login, leave both alone rather than moving it.
    const taken = await prisma.doctor.findFirst({ where: { userId: account.id }, select: { id: true } });
    if (taken) continue;
    toLink.push({ doctorId: d.id, userId: account.id, name: d.name, email });
  }

  console.log(`\nDoctor records to link to their account: ${toLink.length}`);
  for (const r of toLink) console.log(`  ${r.name.padEnd(28)} ${r.email}`);

  if (noAccount.length) {
    console.log(`\nDoctor records with an email but NO login account (${noAccount.length}):`);
    console.log('  These doctors cannot sign in. Set a password on the Doctors page to give them one.');
    for (const r of noAccount) console.log(`  ${r.name.padEnd(28)} ${r.email}`);
  }

  if (!APPLY) {
    console.log('\nNothing was changed. Re-run with --apply to make these changes.\n');
    return;
  }

  for (const r of toPromote) {
    await prisma.user.update({ where: { id: r.userId }, data: { role: clinicBookRoleOf('doctor') } });
  }
  for (const r of toLink) {
    await prisma.doctor.update({ where: { id: r.doctorId }, data: { userId: r.userId } }).catch((e) => {
      console.error(`  ! could not link ${r.name}: ${e?.message ?? e}`);
    });
  }

  console.log(`\nDone. Promoted ${toPromote.length}, linked ${toLink.length}.`);
  console.log('To undo a promotion: set that user\'s role back to the value printed above.\n');
};

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
