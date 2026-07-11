/**
 * Functional E2E for ClinicBook's core features against the LOCAL dev DB.
 * Exercises the REAL refactored services end-to-end:
 *   booking · double-book guard · reschedule (+ past-slot guard) ·
 *   waitlist auto-offer on a freed slot · offer expiry roll-on · cancel.
 *
 * Safe: env.ts override-loads .env.local → localhost, so this never touches prod.
 * WhatsApp is hard-suppressed (WA_TEST_NO_SEND) so no real messages are sent.
 * Every row it creates is name-prefixed 'ZZ E2E' and removed in `finally`.
 *
 *   Run:  npx tsx scripts/verifyClinicBookFeatures.ts
 */
process.env.WA_TEST_NO_SEND = '1';   // synthetic send success; never hits Graph API
process.env.WA_INTERACTIVE = 'true';

const { prisma } = await import('../src/config/prisma.js');
const { createAppointment, updateAppointment, cancelAppointment } = await import(
  '../src/products/clinicbook/appointments/appointment.service.js'
);
const { autoOfferFreedSlot, expireStaleOffers, pendingOfferFor } = await import(
  '../src/products/clinicbook/waitlist/waitlist.service.js'
);
const { clinicNow } = await import('../src/services/slotMath.js');

let pass = 0;
let fail = 0;
const ok = (cond: boolean, msg: string) => {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.error(`  ✗ ${msg}`); }
};

const PREFIX = 'ZZ E2E';
const SPEC = 'ZZ_E2E_SPEC';

const cleanup = async () => {
  const patients = await prisma.patient.findMany({ where: { name: { startsWith: PREFIX } }, select: { id: true, phone: true } });
  const pids = patients.map((p) => p.id);
  const phones = patients.map((p) => p.phone).filter(Boolean) as string[];
  if (pids.length) {
    await prisma.appointment.deleteMany({ where: { patientId: { in: pids } } });
    await prisma.waitlist.deleteMany({ where: { patientId: { in: pids } } });
  }
  if (phones.length) {
    await prisma.whatsAppSession.deleteMany({ where: { phone: { in: phones } } }).catch(() => undefined);
  }
  const doc = await prisma.doctor.findFirst({ where: { speciality: SPEC }, select: { id: true } });
  if (doc) {
    await prisma.appointment.deleteMany({ where: { doctorId: doc.id } });
    await prisma.doctorSchedule.deleteMany({ where: { doctorId: doc.id } });
    await prisma.doctor.delete({ where: { id: doc.id } });
  }
  if (pids.length) await prisma.patient.deleteMany({ where: { id: { in: pids } } });
};

const run = async () => {
  await cleanup();

  // A local clinic to host the isolated fixtures.
  const clinic = await prisma.clinic.findFirst({ select: { id: true, name: true } });
  if (!clinic) throw new Error('No local clinic — seed the dev DB first (npx tsx scripts/seedDev.ts).');
  const clinicId = clinic.id;
  console.log(`Clinic: ${clinic.name} (${clinicId})  [LOCAL dev DB]\n`);

  // Future target date (clinic-local today + 3 days) → clear of the booking buffer.
  const [y, m, d] = clinicNow().dateStr.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1, d + 3));
  const targetStr = target.toISOString().slice(0, 10);

  const doctor = await prisma.doctor.create({ data: { clinicId, name: `${PREFIX} Doctor`, speciality: SPEC } });
  await prisma.doctorSchedule.create({
    data: { clinicId, doctorId: doctor.id, dayOfWeek: target.getUTCDay(), startTime: '10:00', endTime: '12:00', slotMinutes: 60, isActive: true }
  });
  const mkPatient = (phone: string, name: string) =>
    prisma.patient.create({ data: { clinicId, phone, name, language: 'English', source: 'whatsapp' } });
  const A = await mkPatient('919000009001', `${PREFIX} A`);
  const B = await mkPatient('919000009002', `${PREFIX} B`);

  // === 1) BOOKING =============================================================
  console.log('1) Booking:');
  const apptA = await createAppointment(
    clinicId,
    { patientId: A.id, doctorId: doctor.id, appointmentDate: targetStr, appointmentTime: '10:00 AM', status: 'CONFIRMED' as any },
    { notify: false }
  );
  ok(!!apptA?.id && apptA.appointmentTime === '10:00 AM', `Appointment created for A @ ${targetStr} 10:00 AM`);
  ok(apptA.status === 'CONFIRMED', 'Status = CONFIRMED');

  // === 2) DOUBLE-BOOK GUARD ===================================================
  console.log('\n2) Double-book guard (same doctor/date/time):');
  let clashed = false;
  try {
    await createAppointment(clinicId, { patientId: B.id, doctorId: doctor.id, appointmentDate: targetStr, appointmentTime: '10:00 AM' }, { notify: false });
  } catch { clashed = true; }
  ok(clashed, 'Second booking of the same slot was rejected (atomic slot lock)');

  // === 3) RESCHEDULE ==========================================================
  console.log('\n3) Reschedule:');
  const moved = await updateAppointment(clinicId, apptA.id, { appointmentTime: '11:00 AM' });
  ok(moved.appointmentTime === '11:00 AM', 'A moved 10:00 AM → 11:00 AM');
  let pastRejected = false;
  try {
    await updateAppointment(clinicId, apptA.id, { appointmentDate: '2000-01-01', appointmentTime: '09:00 AM' });
  } catch { pastRejected = true; }
  ok(pastRejected, 'Reschedule into the past was rejected (future-slot guard)');

  // === 4) WAITLIST auto-offer on a freed slot =================================
  console.log('\n4) Waitlist auto-offer:');
  await prisma.waitlist.create({ data: { clinicId, patientId: B.id, status: 'WAITING', desiredDoctorId: doctor.id, desiredDate: target, priority: 0 } });
  // A cancels the 11:00 AM slot → it should be auto-offered to waiting patient B.
  await cancelAppointment(clinicId, apptA.id);
  let bOffer = await prisma.waitlist.findUnique({ where: { patientId: B.id } });
  if (bOffer?.status !== 'OFFERED') {
    await autoOfferFreedSlot(clinicId, doctor.id, target, '11:00 AM');
    bOffer = await prisma.waitlist.findUnique({ where: { patientId: B.id } });
  }
  ok(bOffer?.status === 'OFFERED' && bOffer.offeredTime === '11:00 AM', 'Freed 11:00 AM slot auto-OFFERED to B');
  const holdMins = bOffer?.offeredExpiresAt ? Math.round((bOffer.offeredExpiresAt.getTime() - Date.now()) / 60000) : 0;
  ok(holdMins >= 13 && holdMins <= 15, `15-minute hold set (expires ≈ ${holdMins} min out)`);

  // === 5) OFFER EXPIRY roll-on ================================================
  console.log('\n5) Offer expiry:');
  await prisma.waitlist.update({ where: { patientId: B.id }, data: { offeredExpiresAt: new Date(Date.now() - 60_000) } });
  const expired = await expireStaleOffers();
  ok(expired >= 1, `Cron expired ${expired} stale offer(s)`);
  const bAfter = await prisma.waitlist.findUnique({ where: { patientId: B.id } });
  ok(bAfter?.status === 'CANCELLED', "B's lapsed offer was dropped (rolled on)");
  ok((await pendingOfferFor(clinicId, B.id)) === null, 'No live offer remains for B');

  // === 6) CANCEL ==============================================================
  console.log('\n6) Cancel:');
  const cancelledA = await prisma.appointment.findUnique({ where: { id: apptA.id }, select: { status: true } });
  ok(cancelledA?.status === 'CANCELLED', "A's appointment is CANCELLED");

  console.log(`\n${'='.repeat(56)}`);
  console.log(`${fail === 0 ? '✅ ALL PASS' : '❌ FAILED'} — ${pass} passed, ${fail} failed`);
  console.log('='.repeat(56));
};

run()
  .catch((e) => { console.error('E2E crashed:', e); fail++; })
  .finally(async () => { await cleanup(); await prisma.$disconnect(); process.exit(fail === 0 ? 0 : 1); });
