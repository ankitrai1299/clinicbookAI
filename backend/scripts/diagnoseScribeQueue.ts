/**
 * Why does the scribe queue look empty for a doctor?
 *
 *   BACKFILL_DATABASE_URL="postgresql://..." npx tsx scripts/diagnoseScribeQueue.ts
 *
 * READ ONLY. It runs the real listUpcomingAppointments — the same function the
 * /appointments/upcoming route calls — once with no doctor scope (what an admin
 * gets) and once per doctor login (what that doctor gets), so the difference is
 * the answer rather than a guess.
 */

import { PrismaClient } from '@prisma/client';

const url = process.env.BACKFILL_DATABASE_URL;
if (!url) {
  console.error('\nBACKFILL_DATABASE_URL is required — this script will not guess which database to read.\n');
  process.exit(1);
}
// env.ts loads .env then .env.local with override:true, so setting DATABASE_URL
// here and importing afterwards is not enough — .env.local would win and this
// script would silently read the LOCAL database while reporting on production.
// So: load the env module FIRST, let it do its overriding, and only then put the
// URL we were given back in place, before anything constructs a Prisma client.
await import('../src/config/env.js');
process.env.DATABASE_URL = url;
process.env.NODE_ENV = 'production'; // quiet the query log

const { listUpcomingAppointments, findDoctorForLogin } = await import('../src/products/mediscribe/clinicData.js');
const { clinicNow } = await import('../src/services/slotMath.js');

const prisma = new PrismaClient({ datasourceUrl: url });

const main = async () => {
  console.log('clinic-local today =', clinicNow().dateStr, '| minutes', clinicNow().minutes);

  const appts = await prisma.appointment.findMany({
    select: { id: true, clinicId: true, doctorId: true, appointmentDate: true, appointmentTime: true, status: true }
  });
  console.log(`\n${appts.length} appointment row(s) in the database:`);
  for (const a of appts) {
    console.log(
      `  ...${a.id.slice(-6)}  clinic ...${a.clinicId.slice(-6)}  doctor ...${a.doctorId.slice(-6)}  ` +
        `${a.appointmentDate.toISOString().slice(0, 10)} ${a.appointmentTime}  ${a.status}`
    );
  }

  const clinicIds = [...new Set(appts.map((a) => a.clinicId))];
  for (const clinicId of clinicIds) {
    console.log(`\n=== clinic ...${clinicId.slice(-6)} ===`);
    const asAdmin = await listUpcomingAppointments(clinicId);
    console.log(`  as ADMIN (no doctor scope): ${asAdmin.length} row(s)`);
    for (const r of asAdmin) console.log(`      ${r.date} ${r.time}  ${r.patientName} -> ${r.doctorName}`);

    const docs = await prisma.doctor.findMany({
      where: { clinicId },
      select: { id: true, name: true, email: true, userId: true }
    });
    console.log('  Doctor rows, and which login each is tied to:');
    for (const d of docs) {
      console.log(
        `      ...${d.id.slice(-6)}  ${d.name.padEnd(22)} userId ${d.userId ? '...' + d.userId.slice(-6) : 'none  '}  email ${d.email ?? '-'}`
      );
    }

    const users = await prisma.user.findMany({
      where: { clinicId },
      select: { id: true, email: true, role: true, name: true, createdAt: true }
    });
    console.log('  Logins:');
    for (const u of users) {
      console.log(
        `      ...${u.id.slice(-6)}  ${u.email.padEnd(30)} ${u.role.padEnd(13)} ${String(u.name ?? '').padEnd(20)} ${u.createdAt.toISOString().slice(0, 10)}`
      );
    }
    // The scribe keeps its OWN role per user, in the NovaDoc `users` collection,
    // and `/me` prefers it over the ClinicBook one. A stale value there changes
    // what the app shows without anything in ClinicBook looking wrong.
    const scribeUsers = await prisma.novaDoc.findMany({
      where: { clinicId, collection: 'users' },
      select: { id: true, data: true }
    });
    const scribeRole = new Map(
      scribeUsers.map((r) => [r.id, String((r.data as Record<string, unknown>)?.role ?? '?')])
    );
    console.log('  Role the SCRIBE stores for each login (blank = falls through to ClinicBook):');
    for (const u of users) {
      console.log(`      ${u.email.padEnd(30)} ClinicBook ${u.role.padEnd(13)} scribe ${scribeRole.get(u.id) ?? '(none)'}`);
    }

    console.log('  What each login would see in the scribe queue:');
    for (const u of users) {
      const doc = await findDoctorForLogin(clinicId, u.email, u.id);
      const rows = await listUpcomingAppointments(clinicId, { doctorEmail: u.email, doctorUserId: u.id });
      console.log(
        `  as ${u.email} (${u.role}) -> Doctor ${doc ? doc.name : 'NOT LINKED'}: ${rows.length} row(s)`
      );
    }
  }
};

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
