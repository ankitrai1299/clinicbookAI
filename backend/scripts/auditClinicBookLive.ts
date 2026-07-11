// READ-ONLY health audit of the LIVE (Supabase prod) ClinicBook data. Bypasses
// env.ts (which override-loads .env.local → localhost) by pointing a PrismaClient
// explicitly at .env's DATABASE_URL (prod). NO writes — pure counts + consistency
// checks so we can answer "is everything in ClinicBook working on live?".
//
//   Run:  npx tsx scripts/auditClinicBookLive.ts
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient, AppointmentStatus, WaitlistStatus } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envText = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8');
const pick = (k: string) => envText.match(new RegExp(`^${k}\\s*=\\s*"?([^"\\n\\r]+)"?`, 'm'))?.[1];

const url = pick('DATABASE_URL');
const clinicId = pick('WHATSAPP_CLINIC_ID');
if (!url) throw new Error('DATABASE_URL not found in backend/.env');
if (!clinicId) throw new Error('WHATSAPP_CLINIC_ID not found in backend/.env');

console.log('Prod DB :', url.replace(/:[^@/]*@/, ':***@').replace(/\?.*$/, ''));
console.log('Clinic  :', clinicId);

const prisma = new PrismaClient({ datasourceUrl: url });

const today = new Date().toISOString().slice(0, 10);
const problems: string[] = [];
const flag = (msg: string) => problems.push(msg);

const run = async () => {
  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { name: true, plan: true } });
  console.log(`\n=== ${clinic?.name ?? '(unknown clinic)'}  [plan: ${clinic?.plan ?? '?'}] ===`);
  if (!clinic) flag('Live clinic row not found for WHATSAPP_CLINIC_ID');

  // 1) BOOKING CAPACITY — doctors + active schedules (no doctor/schedule = nobody can book).
  const doctors = await prisma.doctor.count({ where: { clinicId } });
  const activeSchedules = await prisma.doctorSchedule.count({ where: { clinicId, isActive: true } });
  const patients = await prisma.patient.count({ where: { clinicId } });
  console.log(`\n[1] Capacity   doctors=${doctors}  activeSchedules=${activeSchedules}  patients=${patients}`);
  if (doctors === 0) flag('No doctors — booking impossible');
  if (activeSchedules === 0) flag('No active doctor schedules — no slots can be generated');

  // 2) BOOKINGS by status.
  const byStatus = await prisma.appointment.groupBy({
    by: ['status'], where: { clinicId }, _count: { _all: true }
  });
  const count = (s: AppointmentStatus) => byStatus.find((r) => r.status === s)?._count._all ?? 0;
  const totalAppts = byStatus.reduce((n, r) => n + r._count._all, 0);
  console.log(`\n[2] Appointments (total=${totalAppts})`);
  for (const s of Object.values(AppointmentStatus)) console.log(`      ${s.padEnd(10)} ${count(s)}`);

  // 3) RESCHEDULE — the Appointment table keeps NO created/updated timestamp, so a
  //    reschedule leaves no trace in live data; it can only be proven functionally
  //    (see the local E2E). Nothing to report from prod here.
  console.log('\n[3] Reschedule — not derivable from live data (no audit timestamp on Appointment).');

  // 4) WAITLIST by status — CONVERTED>0 proves the freed-slot→offer→claim loop ran live.
  const wl = await prisma.waitlist.groupBy({ by: ['status'], where: { clinicId }, _count: { _all: true } });
  const wlCount = (s: WaitlistStatus) => wl.find((r) => r.status === s)?._count._all ?? 0;
  const wlTotal = wl.reduce((n, r) => n + r._count._all, 0);
  console.log(`\n[4] Waitlist (total=${wlTotal})`);
  for (const s of Object.values(WaitlistStatus)) console.log(`      ${s.padEnd(10)} ${wlCount(s)}`);

  // 5) REMINDERS sent.
  const remSent = await prisma.reminder.count({ where: { sent: true, appointment: { clinicId } } });
  const remPending = await prisma.reminder.count({ where: { sent: false, appointment: { clinicId } } });
  console.log(`\n[5] Reminders  sent=${remSent}  pending=${remPending}`);

  // === CONSISTENCY CHECKS (these catch "kuch galat to nahi") ==================
  console.log('\n[6] Consistency checks:');

  // 6a) Double-booked: same doctor+date+time with >1 live (non-cancelled) appt.
  const clashes = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT COUNT(*)::bigint AS n FROM (
       SELECT "doctorId","appointmentDate","appointmentTime"
       FROM "Appointment"
       WHERE "clinicId" = $1 AND "status" <> 'CANCELLED'
       GROUP BY 1,2,3 HAVING COUNT(*) > 1
     ) t`,
    clinicId
  );
  const clashN = Number(clashes[0]?.n ?? 0);
  console.log(`      double-booked slots        : ${clashN}`);
  if (clashN > 0) flag(`${clashN} slot(s) double-booked (same doctor/date/time, >1 live appt)`);

  // 6b) Stale OFFERED waitlist entries the expiry cron should have cleared.
  const staleOffers = await prisma.waitlist.count({
    where: { clinicId, status: WaitlistStatus.OFFERED, offeredExpiresAt: { lt: new Date() } }
  });
  console.log(`      stale (expired) offers      : ${staleOffers}`);
  if (staleOffers > 0) flag(`${staleOffers} waitlist offer(s) past expiry still marked OFFERED (cron?)`);

  // 6c) Past-dated appointments still PENDING (should have been confirmed/cancelled/completed).
  const stalePending = await prisma.appointment.count({
    where: { clinicId, status: AppointmentStatus.PENDING, appointmentDate: { lt: new Date(today) } }
  });
  console.log(`      past-dated still PENDING    : ${stalePending}`);
  if (stalePending > 5) flag(`${stalePending} past appointments still PENDING (unresolved)`);

  // (Orphan doctor/patient rows are impossible — enforced by required FKs.)

  // === VERDICT ===============================================================
  console.log('\n' + '='.repeat(60));
  if (problems.length === 0) {
    console.log('✅ LIVE OK — no data-consistency problems found.');
  } else {
    console.log(`⚠️  ${problems.length} issue(s) found on live:`);
    for (const p of problems) console.log(`   • ${p}`);
  }
  console.log('='.repeat(60));
};

run()
  .catch((e) => { console.error('Audit crashed:', e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
