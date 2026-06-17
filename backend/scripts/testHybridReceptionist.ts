/**
 * Proves the HYBRID WhatsApp receptionist against the REAL DB + live OpenAI:
 *   • greeting shows the numbered menu (convenience layer),
 *   • a bare NUMBER is understood (menu + slot selection),
 *   • NATURAL LANGUAGE booking works,
 *   • the booked appointment is created as PENDING (admin approval workflow) —
 *     NEVER auto-CONFIRMED — and raises a dashboard notification.
 *
 * Drives patientAgentReply exactly as inbound WhatsApp would. Seeds throwaway
 * patients, runs the conversations, verifies, then cleans up.
 *
 *   Run (no server needed):  npx tsx scripts/testHybridReceptionist.ts
 */
import path from 'path';
import { fileURLToPath } from 'url';

import dotenv from 'dotenv';

import { prisma } from '../src/config/prisma.js';
import { patientAgentReply } from '../src/modules/ai/ai.service.js';
import { getAvailableSlots } from '../src/services/scheduling.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? (pass += 1) : (fail += 1);
};

const todayUTC = () => new Date().toISOString().slice(0, 10);
const addDaysUTC = (s: string, n: number) => {
  const d = new Date(`${s}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const makePatient = async (clinicId: string, label: string) => {
  const phone = `15551${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 9)}`;
  return prisma.patient.create({
    data: { clinicId, name: `Hybrid ${label}`, phone, language: 'English', source: 'whatsapp' },
    select: { id: true, name: true, phone: true }
  });
};

const cleanup = async (patientId: string) => {
  const appts = await prisma.appointment.findMany({ where: { patientId }, select: { id: true } });
  for (const a of appts) {
    await prisma.notification.deleteMany({ where: { appointmentId: a.id } }).catch(() => undefined);
  }
  await prisma.appointment.deleteMany({ where: { patientId } }).catch(() => undefined);
  const convos = await prisma.aiConversation.findMany({ where: { patientId }, select: { id: true } });
  for (const c of convos) {
    await prisma.aiMessage.deleteMany({ where: { conversationId: c.id } }).catch(() => undefined);
  }
  await prisma.aiConversation.deleteMany({ where: { patientId } }).catch(() => undefined);
  await prisma.patient.delete({ where: { id: patientId } }).catch(() => undefined);
};

const run = async () => {
  const clinicId = process.env.WHATSAPP_CLINIC_ID;
  if (!clinicId) throw new Error('WHATSAPP_CLINIC_ID is not set in backend/.env');
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required for the hybrid test');

  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { name: true } });
  if (!clinic) throw new Error(`No clinic found for WHATSAPP_CLINIC_ID=${clinicId}`);
  console.log(`Clinic under test: ${clinic.name} (${clinicId})\n`);

  // Find a speciality + the earliest date that actually has open slots.
  const doctors = await prisma.doctor.findMany({ where: { clinicId }, select: { id: true, speciality: true } });
  let speciality = '';
  let bookDate = '';
  outer: for (let i = 0; i < 14; i += 1) {
    const date = addDaysUTC(todayUTC(), i);
    for (const d of doctors) {
      if ((await getAvailableSlots(clinicId, d.id, date)).length > 0) {
        speciality = d.speciality.trim();
        bookDate = date;
        break outer;
      }
    }
  }
  if (!speciality) throw new Error('No open slots in the next 14 days — cannot run booking test.');
  console.log(`Will book: ${speciality} on ${bookDate}\n`);

  // ===================================================================
  // SCENARIO 1 — menu convenience: greeting → numbered menu, "1" → booking
  // ===================================================================
  console.log('── Scenario 1: numbered menu ──');
  const p1 = await makePatient(clinicId, 'Menu');
  const say1 = async (msg: string) => {
    const r = await patientAgentReply({
      clinicId,
      patientId: p1.id,
      patientName: p1.name,
      clinicName: clinic.name,
      phone: p1.phone,
      message: msg
    });
    console.log(`\n👤 ${JSON.stringify(msg)}\n🤖 ${r.reply}`);
    return r.reply;
  };
  try {
    const menu = await say1('hi');
    check(
      'Greeting shows numbered main menu',
      /1\.\s*Book Appointment/i.test(menu) && /2\.\s*Check/i.test(menu) && /3\.\s*Cancel/i.test(menu) && /4\.\s*Reschedule/i.test(menu)
    );
    const afterOne = await say1('1');
    check(
      'Bare "1" after menu is understood as Book intent',
      /special|cardio|dermat|pediat|ortho|physician|doctor|which|date|day|book/i.test(afterOne) && afterOne.length > 0
    );
  } finally {
    await cleanup(p1.id);
  }

  // ===================================================================
  // SCENARIO 2 — natural language + number selection → PENDING booking
  // ===================================================================
  console.log('\n── Scenario 2: natural language booking (must end PENDING) ──');
  const p2 = await makePatient(clinicId, 'NL');
  const say2 = async (msg: string) => {
    const r = await patientAgentReply({
      clinicId,
      patientId: p2.id,
      patientName: p2.name,
      clinicName: clinic.name,
      phone: p2.phone,
      message: msg
    });
    console.log(`\n👤 ${JSON.stringify(msg)}\n🤖 ${r.reply}`);
    return r.reply;
  };

  let bookedId = '';
  try {
    let reply = await say2(`I'd like to book a ${speciality} appointment on ${bookDate}`);
    let usedNumberSelection = false;

    // Respond like a real patient, preferring the numbered convenience layer,
    // until a PENDING appointment appears (bounded so it can't loop forever).
    for (let turn = 0; turn < 8; turn += 1) {
      const appt = await prisma.appointment.findFirst({ where: { clinicId, patientId: p2.id } });
      if (appt) {
        bookedId = appt.id;
        break;
      }
      const hasNumberedList = /(^|\n)\s*1[.)]/.test(reply);
      let next: string;
      if (hasNumberedList) {
        next = '1'; // pick the first offered slot via the number convenience
        usedNumberSelection = true;
      } else if (/confirm|reply\s*\*?\s*yes|say\s*yes|\byes\b/i.test(reply)) {
        next = 'yes';
      } else if (/date|which day|when/i.test(reply)) {
        next = bookDate;
      } else if (/special|doctor|cardio|dermat|pediat|ortho|physician/i.test(reply)) {
        next = speciality;
      } else {
        next = 'yes';
      }
      reply = await say2(next);
    }

    // Final check in case the booking landed on the last turn.
    if (!bookedId) {
      const appt = await prisma.appointment.findFirst({ where: { clinicId, patientId: p2.id } });
      if (appt) bookedId = appt.id;
    }

    check('Natural-language booking created an appointment', Boolean(bookedId), bookedId || 'none');
    check('Number convenience layer was exercised during booking', usedNumberSelection);

    if (bookedId) {
      const appt = await prisma.appointment.findUnique({
        where: { id: bookedId },
        include: { doctor: { select: { speciality: true } } }
      });
      check('Appointment status is PENDING (NOT auto-CONFIRMED)', appt?.status === 'PENDING', `status=${appt?.status}`);
      check('Booked doctor matches requested speciality', appt?.doctor?.speciality.trim() === speciality, appt?.doctor?.speciality ?? '');
      const notif = await prisma.notification.findFirst({
        where: { clinicId, appointmentId: bookedId, type: 'APPOINTMENT_BOOKED' }
      });
      check('Dashboard notification created (APPOINTMENT_BOOKED)', Boolean(notif));
    }
  } finally {
    await cleanup(p2.id);
  }

  console.log(`\n──────────────────────────────\nRESULT: ${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
};

run().catch(async (err) => {
  console.error('\nTest crashed:', err?.message ?? err);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
