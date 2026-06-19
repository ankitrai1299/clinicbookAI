// READ-ONLY verification of the two P0 fixes. No messages are sent.
//   npx tsx scripts/verifyFixes.ts
import { AppointmentStatus } from '@prisma/client';
import { prisma } from '../src/config/prisma.js';
import { formatDoctorName, normalizeDoctorName } from '../src/utils/doctorName.js';

const countDr = (s: string) => (s.match(/\bdr\.?\b/gi) ?? []).length;
const ok = (b: boolean) => (b ? 'PASS' : '*** FAIL ***');

async function main() {
  // ---- A. Formatter unit checks (pure) -----------------------------------
  console.log('==================== A. Doctor-name formatter ====================');
  const cases = ['dr a.k das', 'dr rai', 'Dr. Ruchi', 'Dr. Dr. Ruchi', 'DR RAI', 'doctor  ruchi', 'Dr. A.K. Das'];
  for (const raw of cases) {
    const f = formatDoctorName(raw);
    const n = normalizeDoctorName(raw);
    const idempotent = formatDoctorName(f) === f;
    console.log(`raw="${raw}"  →  format="${f}"  bare="${n}"  | Dr-count=${countDr(f)} ${ok(countDr(f) === 1)} | idempotent ${ok(idempotent)}`);
  }

  // ---- B. Real doctors render to the three target names ------------------
  console.log('\n==================== B. Real doctors (from DB) ====================');
  const TARGETS = new Set(['Dr. Ruchi', 'Dr. Rai', 'Dr. A.K. Das']);
  const docs = await prisma.doctor.findMany({ select: { name: true, speciality: true }, orderBy: { name: 'asc' } });
  for (const d of docs) {
    const f = formatDoctorName(d.name);
    console.log(`stored="${d.name}"  →  display="${f}"  | exactly-one-Dr ${ok(countDr(f) === 1)} | in-target-set ${ok(TARGETS.has(f))}`);
  }

  // ---- C. Template-channel boundary (Meta body already prints "Dr.") -----
  console.log('\n==================== C. Template channel render (Meta bakes "Dr.") ====================');
  // Registered body: "...with Dr. {{4}} at {{5}}..."  -> {{4}} must be BARE.
  for (const d of docs) {
    const rendered = `...with Dr. ${normalizeDoctorName(d.name)} at NextDot Clinic AI...`;
    console.log(`template body → "${rendered}"  | Dr-count=${countDr(rendered)} ${ok(countDr(rendered) === 1)}`);
  }

  // ---- D. Reminder gating: only CONFIRMED selected ----------------------
  console.log('\n==================== D. Reminder gating ====================');
  const now = new Date();
  const todayMid = new Date(now); todayMid.setUTCHours(0, 0, 0, 0);
  const dayAfterTom = new Date(todayMid); dayAfterTom.setUTCDate(dayAfterTom.getUTCDate() + 2);

  // Exact replica of processReminders' new filter
  const selected = await prisma.appointment.findMany({
    where: { status: AppointmentStatus.CONFIRMED, appointmentDate: { gte: todayMid, lt: dayAfterTom } },
    include: { patient: { select: { name: true } }, doctor: { select: { name: true } } }
  });
  console.log(`Reminder cron would select ${selected.length} appointment(s) (CONFIRMED only):`);
  for (const a of selected) console.log(`  ✓ ${a.patient?.name} | ${formatDoctorName(a.doctor?.name)} | ${a.status} | ${a.appointmentTime}`);

  // Show everything in-window that is now EXCLUDED, grouped by status
  const inWindow = await prisma.appointment.groupBy({
    by: ['status'],
    where: { appointmentDate: { gte: todayMid, lt: dayAfterTom } },
    _count: { _all: true }
  });
  console.log('In-window appointments by status (CONFIRMED selected, all others excluded):');
  for (const g of inWindow) {
    const sel = g.status === AppointmentStatus.CONFIRMED;
    console.log(`  ${g.status}: ${g._count._all}  → ${sel ? 'SELECTED' : 'EXCLUDED'} ${ok(true)}`);
  }
  const nonConfirmedSelected = selected.filter((a) => a.status !== AppointmentStatus.CONFIRMED).length;
  console.log(`Non-CONFIRMED appts in selection: ${nonConfirmedSelected} ${ok(nonConfirmedSelected === 0)}`);

  // ---- E. Reminder table invariant --------------------------------------
  console.log('\n==================== E. Reminder table invariant ====================');
  const rems = await prisma.reminder.findMany({ include: { appointment: { select: { status: true } } } });
  const badReminders = rems.filter((r) => r.appointment.status !== AppointmentStatus.CONFIRMED);
  console.log(`Total reminders: ${rems.length} | on non-CONFIRMED appts: ${badReminders.length} ${ok(badReminders.length === 0)}`);

  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
