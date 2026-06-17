/**
 * Proves the WhatsApp receptionist works for ANY patient number — not just Ankit
 * — by driving TWO distinct patients through the FULL real path against the
 * running server:
 *
 *   signed webhook POST → signature verify → controller → patient resolution →
 *   AI receptionist → booking → WhatsApp send → dashboard notification.
 *
 * Each patient is first REGISTERED with a FORMATTED phone ("+91 98xxx xxxxx")
 * while Meta delivers inbound as bare digits ("9198xxxxxxxx") — this also proves
 * the format-robust resolution fix (no duplicate patient is created).
 *
 * For each number it asserts: registration → reply → speciality selection →
 * slot selection → booking (PENDING) → dashboard notification.
 *
 *   Run (server must be running):  npx tsx scripts/proveMultiPatient.ts
 */
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

import axios from 'axios';
import dotenv from 'dotenv';

import { prisma } from '../src/config/prisma.js';
import { createPublicPatient } from '../src/modules/patients/patient.service.js';
import { getAvailableSlots } from '../src/services/scheduling.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const PORT = process.env.PORT ?? '4000';
const WEBHOOK = `http://localhost:${PORT}/api/whatsapp/webhook`;
const APP_SECRET = process.env.WHATSAPP_APP_SECRET ?? '';
const CLINIC_ID = process.env.WHATSAPP_CLINIC_ID!;

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`   ${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? (pass += 1) : (fail += 1);
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const todayUTC = () => new Date().toISOString().slice(0, 10);
const addDaysUTC = (s: string, n: number) => {
  const d = new Date(`${s}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// POST a Meta-shaped inbound text webhook, signed exactly like Meta signs it.
const sendInbound = async (fromDigits: string, text: string) => {
  const body = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'ENTRY',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: process.env.PHONE_NUMBER_ID },
              messages: [
                {
                  from: fromDigits,
                  id: `wamid.PROVE_${fromDigits}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  type: 'text',
                  text: { body: text }
                }
              ]
            }
          }
        ]
      }
    ]
  });
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (APP_SECRET) {
    headers['x-hub-signature-256'] = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(body).digest('hex');
  }
  const res = await axios.post(WEBHOOK, body, { headers, validateStatus: () => true });
  return res.status;
};

// The bot replies asynchronously (fire-and-forget after the 200). Read the most
// recent auto_reply we logged for this number, newer than `afterIso`.
const waitForReply = async (toDigits: string, afterIso: Date): Promise<string> => {
  for (let i = 0; i < 25; i += 1) {
    const log = await prisma.whatsAppLog.findFirst({
      where: { to: toDigits, messageType: 'auto_reply', createdAt: { gt: afterIso } },
      orderBy: { createdAt: 'desc' }
    });
    if (log) return log.body;
    await sleep(400);
  }
  return '';
};

interface PatientCase {
  label: string;
  registeredPhone: string; // formatted, as a clinic/patient would type it
  inboundDigits: string; // how Meta delivers it (bare international digits)
}

const runCase = async (c: PatientCase, speciality: string) => {
  console.log(`\n=== Patient: ${c.label} | registered "${c.registeredPhone}" | inbound ${c.inboundDigits} ===`);

  // 1) REGISTRATION (real public self-registration path; sends welcome message).
  const registered = await createPublicPatient(CLINIC_ID, {
    name: c.label,
    phone: c.registeredPhone,
    age: 30,
    gender: 'Other',
    healthConcern: 'General consultation'
  });
  check('Registration created patient record', Boolean(registered?.id), `id=${registered.patientCode ?? registered.id}`);

  const reply = async (text: string): Promise<string> => {
    const t0 = new Date();
    const status = await sendInbound(c.inboundDigits, text);
    if (status !== 200) return `__HTTP_${status}__`;
    const r = await waitForReply(c.inboundDigits, t0);
    console.log(`   👤 ${JSON.stringify(text)}\n   🤖 ${r.replace(/\n/g, ' ').slice(0, 90)}`);
    return r;
  };

  // 2) REPLY works — first inbound gets answered.
  const r1 = await reply('hi');
  check('Reply works (bot answered first inbound)', r1.length > 0 && !r1.startsWith('__HTTP_'), r1.startsWith('__HTTP_') ? r1 : '');

  // 3) Drive the booking with the numbered convenience layer; heuristic patient.
  let bookedId = '';
  let sawSpeciality = false;
  let sawSlots = false;
  let last = await reply('book appointment');
  for (let turn = 0; turn < 9 && !bookedId; turn += 1) {
    if (/special|cardio|dermat|pediat|ortho|physician|which (type|doctor)/i.test(last)) sawSpeciality = true;
    if (/slot|available|\bAM\b|\bPM\b|which time|pick a time/i.test(last)) sawSlots = true;

    const appt = await prisma.appointment.findFirst({ where: { clinicId: CLINIC_ID, patientId: registered.id } });
    if (appt) {
      bookedId = appt.id;
      break;
    }

    const hasList = /(^|\n)\s*1[.)]/.test(last);
    let next: string;
    if (hasList) next = '1';
    else if (/confirm|reply\s*\*?\s*yes|\byes\b/i.test(last)) next = 'yes';
    else if (/special|which (type|doctor)|doctor/i.test(last)) next = speciality;
    else if (/date|which day|when/i.test(last)) next = addDaysUTC(todayUTC(), 1);
    else next = 'yes';
    last = await reply(next);
  }
  if (!bookedId) {
    const appt = await prisma.appointment.findFirst({ where: { clinicId: CLINIC_ID, patientId: registered.id } });
    if (appt) bookedId = appt.id;
  }

  check('Speciality selection step occurred', sawSpeciality);
  check('Slot selection step occurred', sawSlots);
  check('Booking created an appointment', Boolean(bookedId), bookedId);

  if (bookedId) {
    const appt = await prisma.appointment.findUnique({ where: { id: bookedId }, include: { doctor: true } });
    check('Appointment is PENDING (admin approval workflow preserved)', appt?.status === 'PENDING', `status=${appt?.status}`);

    // The whole point of the resolution fix: the BOOKING is attached to the
    // REGISTERED patient, not a duplicate auto-onboarded record.
    const dupes = await prisma.patient.findMany({
      where: { clinicId: CLINIC_ID },
      select: { id: true, phone: true }
    });
    const sameHuman = dupes.filter((p) => p.phone.replace(/\D/g, '').slice(-10) === c.inboundDigits.slice(-10));
    check('No duplicate patient created (booking on the registered record)', sameHuman.length === 1 && appt?.patientId === registered.id, `records=${sameHuman.length}`);

    const notif = await prisma.notification.findFirst({
      where: { clinicId: CLINIC_ID, appointmentId: bookedId, type: 'APPOINTMENT_BOOKED' }
    });
    check('Dashboard notification appears (APPOINTMENT_BOOKED)', Boolean(notif));
  }

  return { patientId: registered.id, bookedId };
};

const cleanup = async (patientId: string) => {
  const appts = await prisma.appointment.findMany({ where: { patientId }, select: { id: true } });
  for (const a of appts) await prisma.notification.deleteMany({ where: { appointmentId: a.id } }).catch(() => undefined);
  await prisma.appointment.deleteMany({ where: { patientId } }).catch(() => undefined);
  const convos = await prisma.aiConversation.findMany({ where: { patientId }, select: { id: true } });
  for (const cc of convos) await prisma.aiMessage.deleteMany({ where: { conversationId: cc.id } }).catch(() => undefined);
  await prisma.aiConversation.deleteMany({ where: { patientId } }).catch(() => undefined);
  await prisma.patient.delete({ where: { id: patientId } }).catch(() => undefined);
};

const run = async () => {
  if (!CLINIC_ID) throw new Error('WHATSAPP_CLINIC_ID not set');
  // Confirm server is up.
  const health = await axios.get(`http://localhost:${PORT}/health`, { validateStatus: () => true }).catch(() => null);
  if (!health || health.status !== 200) throw new Error(`Backend not reachable on :${PORT} — start it with "npm run dev"`);
  console.log(`Server healthy on :${PORT}. Signature ${APP_SECRET ? 'ENABLED' : 'disabled'}.`);

  // Pick a speciality that has open slots.
  const doctors = await prisma.doctor.findMany({ where: { clinicId: CLINIC_ID }, select: { id: true, speciality: true } });
  let speciality = '';
  outer: for (let i = 0; i < 14; i += 1) {
    const date = addDaysUTC(todayUTC(), i);
    for (const d of doctors) {
      if ((await getAvailableSlots(CLINIC_ID, d.id, date)).length > 0) {
        speciality = d.speciality.trim();
        break outer;
      }
    }
  }
  if (!speciality) throw new Error('No open slots in next 14 days');
  console.log(`Using speciality with availability: ${speciality}`);

  const stamp = Date.now().toString().slice(-6);
  const cases: PatientCase[] = [
    // Two DIFFERENT numbers, both formatted at registration (with spaces/+).
    { label: `Prove One ${stamp}`, registeredPhone: `+91 98${stamp} 11`, inboundDigits: `9198${stamp}11` },
    { label: `Prove Two ${stamp}`, registeredPhone: `+91 97${stamp} 22`, inboundDigits: `9197${stamp}22` }
  ];

  const created: string[] = [];
  try {
    for (const c of cases) {
      const { patientId } = await runCase(c, speciality);
      created.push(patientId);
    }
  } finally {
    for (const id of created) await cleanup(id);
    // Also clear any stray auto-onboarded dupes + logs for these numbers.
    for (const c of cases) {
      await prisma.whatsAppLog.deleteMany({ where: { to: { contains: c.inboundDigits.slice(-10) } } }).catch(() => undefined);
      await prisma.whatsAppConversation.deleteMany({ where: { phone: c.inboundDigits } }).catch(() => undefined);
    }
  }

  console.log(`\n══════════════════════════════\nRESULT: ${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
};

run().catch(async (err) => {
  console.error('\nProof crashed:', err?.message ?? err);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
