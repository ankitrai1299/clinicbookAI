/**
 * Give every doctor in a clinic an app login, and clear out the ones nobody uses.
 *
 *   BACKFILL_DATABASE_URL="postgresql://..." npx tsx scripts/giveAllDoctorsLogins.ts --clinic=<id|hfrId>
 *   ...same, plus --apply     (without it, nothing is written)
 *   ...plus --prune           (also delete DOCTOR accounts no doctor is linked to)
 *
 * Why a script and not ten clicks: the clinic has ten doctors, three of whom had
 * logins on three unrelated personal addresses and seven of whom had none. A
 * doctor with no login cannot open the scribe; a doctor whose login is not LINKED
 * to their Doctor row signs in perfectly and sees an empty day, which looks
 * exactly like "nothing is booked". One pass, one scheme, one password.
 *
 * It calls `giveDoctorLogin` — the same function the admin screen calls — rather
 * than writing the three rows itself. A second implementation would drift, and
 * the part that would drift is `Doctor.userId`, which is the part that matters.
 *
 * The password is deliberately weak and deliberately shared: these are test
 * accounts on a demo clinic. Do not run this against a clinic with real doctors.
 */

const APPLY = process.argv.includes('--apply');
const PRUNE = process.argv.includes('--prune');
const CLINIC_ARG = process.argv.find((a) => a.startsWith('--clinic='))?.slice('--clinic='.length);
const PASSWORD = process.env.DOCTOR_PASSWORD || '123456';
const DOMAIN = process.env.DOCTOR_EMAIL_DOMAIN || 'nextdoc.in';

const url = process.env.BACKFILL_DATABASE_URL;
if (!url) {
  console.error('\nBACKFILL_DATABASE_URL is required — this script will not guess which database to write to.\n');
  process.exit(1);
}

// env.ts loads .env and then .env.local with override:true, so the URL has to be
// restored AFTER it runs and BEFORE anything builds a Prisma client. Set it
// first and this writes to whichever database .env.local names — which on a
// developer machine is not the one you meant.
// NODE_ENV has to be set BEFORE the import: prisma.ts reads the PARSED value to
// decide whether to log every query, and by then it is already fixed.
process.env.NODE_ENV = 'production';
await import('../src/config/env.js');
process.env.DATABASE_URL = url;

const { prisma } = await import('../src/config/prisma.js');
const { giveDoctorLogin } = await import('../src/products/mediscribe/routes/admin.js');
// giveDoctorLogin's last step writes the scribe's own role row through the
// NovaDoc repository, which reads the clinic from AsyncLocalStorage — a request
// normally puts it there. A script is not a request, so it has to bind it
// itself, or that step throws AFTER the account and the link are already
// written and the run half-succeeds.
const { runWithClinic } = await import('../src/products/mediscribe/context.js');

/**
 * "Dr. A.K. Das" → "dr.akdas@<domain>".
 *
 * The honorific is dropped and re-added as the prefix so every address has the
 * same shape, and a surname-only name ("Dr. Rai") still produces a sensible one.
 * Punctuation goes; two doctors who collide get a numeric suffix rather than one
 * of them silently taking the other's address.
 */
const addressFor = (name: string, taken: Set<string>): string => {
  const bare = name.replace(/^dr\.?\s*/i, '').trim();
  const clean = (v: string) => v.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const parts = bare.split(/\s+/).filter(Boolean).map(clean).filter(Boolean);
  // First name — but initials are not a name. "A.K. Das" cleans down to "ak",
  // which as an address says nothing; fold in the next part so it reads "akdas".
  let stem = parts[0] ?? 'doctor';
  if (stem.length <= 2 && parts[1]) stem += parts[1];
  let candidate = `dr.${stem}@${DOMAIN}`;
  let n = 2;
  while (taken.has(candidate)) candidate = `dr.${stem}${n++}@${DOMAIN}`;
  taken.add(candidate);
  return candidate;
};

const main = async () => {
  if (!CLINIC_ARG) {
    console.error('\n--clinic=<id|hfrId> is required. Clinics in this database:\n');
    for (const c of await prisma.clinic.findMany({ select: { id: true, name: true, hfrId: true } })) {
      console.error(`    ${c.id}  ${c.name}${c.hfrId ? `  (hfrId ${c.hfrId})` : ''}`);
    }
    console.error('');
    process.exit(1);
  }

  const clinic = await prisma.clinic.findFirst({
    where: { OR: [{ id: CLINIC_ARG }, { hfrId: CLINIC_ARG }] },
    select: { id: true, name: true }
  });
  if (!clinic) {
    console.error(`\nNo clinic matches "${CLINIC_ARG}".\n`);
    process.exit(1);
  }

  const doctors = await prisma.doctor.findMany({
    where: { clinicId: clinic.id },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, email: true, userId: true }
  });

  console.log(`\n${clinic.name} — ${doctors.length} doctors`);
  console.log(APPLY ? 'APPLYING changes.\n' : 'DRY RUN — nothing is written. Add --apply.\n');

  const taken = new Set<string>();
  const plan = doctors.map((d) => ({ doctor: d, email: addressFor(d.name, taken) }));

  console.log('  doctor                  new login                     password  was');
  console.log('  ' + '─'.repeat(84));
  for (const { doctor, email } of plan) {
    const was = doctor.userId ? `linked to ${doctor.email ?? '(no email)'}` : doctor.email ? `email ${doctor.email}, NO login` : 'no login';
    console.log(`  ${doctor.name.padEnd(22)}  ${email.padEnd(28)}  ${PASSWORD.padEnd(8)}  ${was}`);
  }

  if (APPLY) {
    console.log('');
    for (const { doctor, email } of plan) {
      try {
        const result = await runWithClinic(clinic.id, () => giveDoctorLogin(clinic.id, doctor, email, PASSWORD));
        console.log(`  ${doctor.name.padEnd(22)}  ${result.login}${result.reason ? ` — ${result.reason}` : ''}`);
      } catch (err) {
        console.log(`  ${doctor.name.padEnd(22)}  FAILED — ${(err as Error).message}`);
      }
    }
  }

  // Accounts with the DOCTOR role that no Doctor row points at. Each one is a
  // login that works and shows an empty app, which is the most confusing
  // possible outcome — worse than an account that cannot sign in at all.
  const linkedIds = new Set(
    (await prisma.doctor.findMany({ where: { clinicId: clinic.id }, select: { userId: true } }))
      .map((d) => d.userId)
      .filter(Boolean) as string[]
  );
  const orphans = (
    await prisma.user.findMany({
      where: { clinicId: clinic.id, role: 'DOCTOR' },
      select: { id: true, email: true, name: true }
    })
  ).filter((u) => !linkedIds.has(u.id));

  console.log(`\n  ${orphans.length} DOCTOR account(s) linked to no doctor:`);
  for (const o of orphans) console.log(`      ${o.email}  (${o.name})`);

  if (orphans.length && PRUNE && APPLY) {
    // Safe at the schema level: Doctor.userId is SetNull, and EmailOtp,
    // AiConversation and AppPassword cascade. AuditLog keeps a plain string, so
    // the trail of what these accounts did survives them.
    const { count } = await prisma.user.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } });
    console.log(`  deleted ${count}`);
  } else if (orphans.length && !PRUNE) {
    console.log('  (add --prune to delete them)');
  }

  console.log('');
};

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
