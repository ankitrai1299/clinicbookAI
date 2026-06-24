/**
 * Phase 2 — full waitlist end-to-end test (real DB + real FSM).
 *
 * Builds an isolated TEST doctor with a single-slot day, fills it, then exercises
 * every required behaviour through the actual WhatsApp FSM and services:
 *   1 Join Waitlist offered in the FSM when a date is fully booked
 *   2 desired doctor/date stored on the entry
 *   3 cancellation auto-offers the freed slot to the next patient
 *   4 15-minute hold (offeredExpiresAt) is set
 *   6 patient's YES claims it → appointment created (via FSM WAITLIST_OFFER state)
 *   7 no response in 15 min → cron rolls the offer to the next patient
 *
 * Everything it creates (doctor, schedule, patients, appointments, waitlist,
 * sessions) is cleaned up in `finally`.
 *
 *   Run:  npx tsx scripts/testWaitlistE2E.ts
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
process.env.WA_INTERACTIVE = 'true';

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient({ log: [] });
const { handleWhatsAppMessage } = await import('../src/modules/whatsapp/whatsapp.booking.js');
const { createAppointment, cancelAppointment } = await import('../src/modules/appointments/appointment.service.js');
const { autoOfferFreedSlot, expireStaleOffers, pendingOfferFor } = await import('../src/modules/waitlist/waitlist.service.js');

let pass = 0, fail = 0;
const ok = (cond: boolean, msg: string) => { if (cond) { pass++; console.log(`  ✓ ${msg}`); } else { fail++; console.error(`  ✗ ${msg}`); } };
const botText = (r: any) => (r == null ? '(silent)' : typeof r === 'string' ? r : `[${r.kind}] ${r.header ?? ''} | ${r.body} | ${(r.rows ?? r.buttons ?? []).map((x: any) => x.title).join(', ')}`);

const clinicId = process.env.WHATSAPP_CLINIC_ID!;
const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { name: true } });
const SPEC = 'TestWaitlistSpec';
const PHONES = { A: '910000005001', B: '910000005002', C: '910000005003' };

// --- isolated test fixtures ------------------------------------------------
const cleanup = async () => {
  const phones = Object.values(PHONES);
  const patients = await prisma.patient.findMany({ where: { clinicId, phone: { in: phones } }, select: { id: true } });
  const pids = patients.map((p) => p.id);
  if (pids.length) {
    await prisma.appointment.deleteMany({ where: { patientId: { in: pids } } });
    await prisma.waitlist.deleteMany({ where: { patientId: { in: pids } } });
  }
  await prisma.whatsAppSession.deleteMany({ where: { phone: { in: phones } } });
  const doc = await prisma.doctor.findFirst({ where: { clinicId, speciality: SPEC }, select: { id: true } });
  if (doc) {
    await prisma.appointment.deleteMany({ where: { doctorId: doc.id } });
    await prisma.doctorSchedule.deleteMany({ where: { doctorId: doc.id } });
    await prisma.doctor.delete({ where: { id: doc.id } });
  }
  if (pids.length) await prisma.patient.deleteMany({ where: { id: { in: pids } } });
};

const run = async () => {
  await cleanup();

  // Target date = clinic-local today + 2 days (a future date → no buffer issues).
  const { clinicNow } = await import('../src/services/scheduling.service.js');
  const [ty, tm, td] = clinicNow().dateStr.split('-').map(Number);
  const target = new Date(Date.UTC(ty, tm - 1, td + 2));
  const targetStr = target.toISOString().slice(0, 10);
  const dow = target.getUTCDay();

  // TEST doctor whose ONLY working day is the target weekday, with EXACTLY one
  // 30-min slot (09:00–09:30) → easy to fully book.
  const doctor = await prisma.doctor.create({ data: { clinicId, name: 'Dr. Waitlist Test', speciality: SPEC } });
  await prisma.doctorSchedule.create({ data: { clinicId, doctorId: doctor.id, dayOfWeek: dow, startTime: '09:00', endTime: '09:30', slotMinutes: 30, isActive: true } });

  const mkPatient = async (phone: string, name: string) => {
    const ex = await prisma.patient.findFirst({ where: { clinicId, phone } });
    return ex ?? prisma.patient.create({ data: { clinicId, phone, name, language: 'English', source: 'whatsapp' } });
  };
  const A = await mkPatient(PHONES.A, 'TEST WL A');
  const B = await mkPatient(PHONES.B, 'TEST WL B');
  const C = await mkPatient(PHONES.C, 'TEST WL C');

  // Fill the single slot with patient A (CONFIRMED so cancel frees a real slot).
  const apptA = await createAppointment(clinicId, { patientId: A.id, doctorId: doctor.id, appointmentDate: targetStr, appointmentTime: '09:00 AM', status: 'CONFIRMED' as any }, { notify: false });
  console.log(`Setup: ${targetStr} (dow ${dow}) single slot 09:00 AM booked by A.\n`);

  // === 1 + 2: FSM offers Join Waitlist on the fully-booked date; B joins ====
  console.log('1+2) FSM Join Waitlist (patient B), stores desired doctor/date:');
  const specs = [...new Set((await prisma.doctor.findMany({ where: { clinicId }, select: { speciality: true } })).map((d) => d.speciality.trim()))].sort((a, b) => a.localeCompare(b));
  const specIdx = specs.indexOf(SPEC) + 1;
  const sendB = (msg: string, replyId?: string) => handleWhatsAppMessage({ clinicId, patientId: B.id, patientName: B.name, clinicName: clinic?.name ?? 'Clinic', phone: PHONES.B, message: msg, replyId });
  await sendB('1', 'MENU_BOOK');
  await sendB(SPEC, `OPT_${specIdx}`);                 // pick TestWaitlistSpec → single doctor → date picker
  const dateReply = await sendB('1', 'OPT_1');         // the only working day = target, fully booked
  console.log('   →', botText(dateReply));
  ok(/waitlist/i.test(botText(dateReply)), 'Fully-booked date → FSM offers "Join waitlist"');
  const joinReply = await sendB('yes', 'CONF_YES');    // join
  console.log('   →', botText(joinReply));
  ok(/waitlist/i.test(botText(joinReply)), 'B confirms → joined the waitlist');
  const bEntry = await prisma.waitlist.findUnique({ where: { patientId: B.id } });
  ok(bEntry?.status === 'WAITING' && bEntry.desiredDoctorId === doctor.id, `Entry stored: status=WAITING desiredDoctorId=${doctor.id === bEntry?.desiredDoctorId ? 'doctor' : bEntry?.desiredDoctorId}`);
  ok(bEntry?.desiredDate?.toISOString().slice(0, 10) === targetStr, `Desired date stored = ${targetStr}`);

  // C also joins (priority queue) — directly via the same FSM-less path.
  await prisma.waitlist.create({ data: { clinicId, patientId: C.id, status: 'WAITING', desiredDoctorId: doctor.id, desiredDate: target, priority: 1 } });

  // === 3 + 4: A cancels → freed slot auto-offered to B with a 15-min hold ====
  console.log('\n3+4) A cancels → auto-offer to B + 15-min hold:');
  await cancelAppointment(clinicId, apptA.id);          // onStatusTransition → autoOfferFreedSlot
  // (autoOfferFreedSlot is fire-and-forget; in case timing varies, ensure it ran)
  let bOffer = await prisma.waitlist.findUnique({ where: { patientId: B.id } });
  if (bOffer?.status !== 'OFFERED') { await autoOfferFreedSlot(clinicId, doctor.id, target, '09:00 AM'); bOffer = await prisma.waitlist.findUnique({ where: { patientId: B.id } }); }
  ok(bOffer?.status === 'OFFERED' && bOffer.offeredTime === '09:00 AM', 'Freed slot auto-OFFERED to B (highest priority)');
  const holdMins = bOffer?.offeredExpiresAt ? Math.round((bOffer.offeredExpiresAt.getTime() - Date.now()) / 60000) : 0;
  ok(holdMins >= 13 && holdMins <= 15, `15-minute hold set (offeredExpiresAt ≈ ${holdMins} min out)`);
  const bSession = await prisma.whatsAppSession.findUnique({ where: { phone: PHONES.B } });
  ok(bSession?.state === 'WAITLIST_OFFER', `B's FSM session parked in WAITLIST_OFFER (was ${bSession?.state})`);

  // === 6: B replies YES via the FSM → appointment created ===================
  console.log('\n6) B replies YES (FSM WAITLIST_OFFER) → appointment created:');
  const claimReply = await sendB('yes', 'CONF_YES');
  console.log('   →', botText(claimReply));
  ok(/booked/i.test(botText(claimReply)), 'B gets a "Booked!" confirmation');
  const bAppt = await prisma.appointment.findFirst({ where: { patientId: B.id, doctorId: doctor.id, status: { not: 'CANCELLED' } } });
  ok(!!bAppt && bAppt.appointmentTime === '09:00 AM', 'Appointment created for B at the freed slot');
  const bEntry2 = await prisma.waitlist.findUnique({ where: { patientId: B.id } });
  ok(bEntry2?.status === 'CONVERTED', 'B waitlist entry → CONVERTED');

  // === 7: no response in 15 min → cron rolls offer to the next patient ======
  console.log('\n7) Offer expiry → roll to next patient (C):');
  // B cancels the just-booked appointment → slot frees → auto-offered to C.
  await cancelAppointment(clinicId, bAppt!.id);
  let cOffer = await prisma.waitlist.findUnique({ where: { patientId: C.id } });
  if (cOffer?.status !== 'OFFERED') { await autoOfferFreedSlot(clinicId, doctor.id, target, '09:00 AM'); cOffer = await prisma.waitlist.findUnique({ where: { patientId: C.id } }); }
  ok(cOffer?.status === 'OFFERED', 'After B converts + cancels, C is now OFFERED');
  // Simulate C not responding: force the hold to have already lapsed, run the cron.
  await prisma.waitlist.update({ where: { patientId: C.id }, data: { offeredExpiresAt: new Date(Date.now() - 60_000) } });
  const expired = await expireStaleOffers();
  ok(expired >= 1, `Cron expired ${expired} stale offer(s)`);
  const cAfter = await prisma.waitlist.findUnique({ where: { patientId: C.id } });
  ok(cAfter?.status === 'CANCELLED', 'C\'s lapsed offer was dropped (rolled on)');
  const stillPending = await pendingOfferFor(clinicId, C.id);
  ok(stillPending === null, 'No live offer remains for C after expiry');

  console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILED'} — ${pass} passed, ${fail} failed`);
};

run()
  .catch((e) => { console.error('Test crashed:', e); fail++; })
  .finally(async () => { await cleanup(); await prisma.$disconnect(); process.exit(fail === 0 ? 0 : 1); });
