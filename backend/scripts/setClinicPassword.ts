// Set a clinic-owner's password directly, for a login whose email inbox cannot
// be reached (so the normal "forgot password" link is no use).
//
// Deliberately narrow and loud:
//   • Touches exactly ONE account, named on the command line. No search, no
//     bulk, no "while I'm here".
//   • Refuses to run without DATABASE_URL passed in — it will never fall back
//     to a committed .env, so it cannot hit the wrong database by accident.
//   • Marks the email verified, because the whole reason to run this is that
//     the OTP cannot be collected, and bumps tokenVersion so any old session
//     for that account is invalidated.
//
//   DATABASE_URL="<prod url>" TARGET_EMAIL="a@b.com" NEW_PASSWORD="…" \
//     npx tsx scripts/setClinicPassword.ts
//
// or, without ever handling the raw URL yourself:
//   TARGET_EMAIL="a@b.com" NEW_PASSWORD="…" railway run npx tsx scripts/setClinicPassword.ts
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const url = process.env.DATABASE_URL;
const email = (process.env.TARGET_EMAIL || '').trim().toLowerCase();
const password = process.env.NEW_PASSWORD || '';

if (!url) throw new Error('DATABASE_URL is required — pass the production URL, or run under `railway run`.');
if (!email) throw new Error('TARGET_EMAIL is required.');
if (password.length < 8) throw new Error('NEW_PASSWORD must be at least 8 characters.');

const prisma = new PrismaClient({ datasources: { db: { url } } });

(async () => {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, role: true, emailVerified: true, clinicId: true },
  });
  if (!user) throw new Error(`No account with email ${email}. Nothing was changed.`);

  const clinic = await prisma.clinic.findUnique({
    where: { id: user.clinicId },
    select: { name: true, products: true },
  });

  console.log('About to reset:');
  console.log(`  ${user.name}  <${user.email}>   role ${user.role}`);
  console.log(`  clinic: ${clinic?.name}   products: ${JSON.stringify(clinic?.products)}`);
  console.log(`  was verified: ${user.emailVerified}`);

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, emailVerified: true, tokenVersion: { increment: 1 } },
  });

  console.log('\nDone. This account can now sign in with the new password, no OTP needed.');
  console.log('Any previously-issued session for it has been invalidated.');
})()
  .catch((e) => { console.error('FAILED (nothing partial — it is one update):', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
