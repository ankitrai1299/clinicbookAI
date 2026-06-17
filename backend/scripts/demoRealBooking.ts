/**
 * LIVE demo of the full WhatsApp receptionist workflow against a REAL connected
 * (verified) patient number. Drives a real booking via signed webhook POSTs so
 * each bot reply is actually SENT to the patient's WhatsApp, and prints the full
 * turn-by-turn transcript.
 *
 * NOTE: this is NOT self-cleaning — the appointment is left as PENDING so it
 * shows up in the dashboard, and the messages stay on the patient's phone.
 *
 *   Run (server must be running):  npx tsx scripts/demoRealBooking.ts <inboundDigits>
 *   e.g.                           npx tsx scripts/demoRealBooking.ts 917254863177
 */
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

import axios from 'axios';
import dotenv from 'dotenv';

import { prisma } from '../src/config/prisma.js';
import { getAvailableSlots } from '../src/services/scheduling.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const PORT = process.env.PORT ?? '4000';
const WEBHOOK = `http://localhost:${PORT}/api/whatsapp/webhook`;
const APP_SECRET = process.env.WHATSAPP_APP_SECRET ?? '';
const CLINIC_ID = process.env.WHATSAPP_CLINIC_ID!;

const INBOUND = process.argv[2] ?? '917254863177'; // Meta delivers "91" + national

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const todayUTC = () => new Date().toISOString().slice(0, 10);
const addDaysUTC = (s: string, n: number) => {
  const d = new Date(`${s}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const sendInbound = async (from: string, text: string) => {
  const body = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'DEMO',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: process.env.PHONE_NUMBER_ID },
              messages: [
                {
                  from,
                  id: `wamid.DEMO_${from}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
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
  if (APP_SECRET) headers['x-hub-signature-256'] = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(body).digest('hex');
  return (await axios.post(WEBHOOK, body, { headers, validateStatus: () => true })).status;
};

const waitForReply = async (to: string, after: Date): Promise<{ body: string; status: string }> => {
  for (let i = 0; i < 30; i += 1) {
    const l = await prisma.whatsAppLog.findFirst({
      where: { to, messageType: 'auto_reply', createdAt: { gt: after } },
      orderBy: { createdAt: 'desc' }
    });
    if (l) return { body: l.body, status: l.status };
    await sleep(400);
  }
  return { body: '', status: 'TIMEOUT' };
};

const reply = async (text: string): Promise<string> => {
  const t0 = new Date();
  const status = await sendInbound(INBOUND, text);
  if (status !== 200) {
    console.log(`   👤 ${text}\n   ⚠️  webhook HTTP ${status}`);
    return '';
  }
  const r = await waitForReply(INBOUND, t0);
  console.log(`\n   👤 PATIENT: ${text}`);
  console.log(`   🤖 BOT${r.status === 'sent' ? ' (✅ sent to phone)' : ` (⚠️ ${r.status})`}:`);
  console.log(
    r.body
      .split('\n')
      .map((line) => `        ${line}`)
      .join('\n')
  );
  return r.body;
};

const run = async () => {
  const health = await axios.get(`http://localhost:${PORT}/health`, { validateStatus: () => true }).catch(() => null);
  if (!health || health.status !== 200) throw new Error(`Backend not reachable on :${PORT} — start it with "npm run dev"`);

  const last10 = INBOUND.replace(/\D/g, '').slice(-10);
  const patient = (await prisma.patient.findMany({ where: { clinicId: CLINIC_ID }, orderBy: { createdAt: 'desc' } }))
    .find((p) => p.phone.replace(/\D/g, '').slice(-10) === last10);
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`LIVE BOOKING DEMO → inbound ${INBOUND}`);
  console.log(`Patient: ${patient ? `${patient.name} (${patient.patientCode}) stored "${patient.phone}"` : '(unknown — will auto-onboard)'}`);
  console.log(`Signature ${APP_SECRET ? 'ENABLED' : 'disabled'}.`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  // Pick a speciality that actually has open slots in the next 14 days.
  const doctors = await prisma.doctor.findMany({ where: { clinicId: CLINIC_ID }, select: { id: true, name: true, speciality: true } });
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
  if (!speciality) throw new Error('No open slots in next 14 days — add doctor availability first.');
  console.log(`(Using speciality with availability: ${speciality})`);

  const findAppt = async () => {
    const p = (await prisma.patient.findMany({ where: { clinicId: CLINIC_ID }, orderBy: { createdAt: 'desc' } }))
      .find((x) => x.phone.replace(/\D/g, '').slice(-10) === last10);
    if (!p) return null;
    return prisma.appointment.findFirst({ where: { clinicId: CLINIC_ID, patientId: p.id }, orderBy: { appointmentDate: 'desc' }, include: { doctor: true, patient: true } });
  };

  // Turn 1: greeting.
  await reply('hi');

  // Turn 2+: drive the booking using the numbered convenience layer.
  let last = await reply('I want to book an appointment');
  let appt = null;
  for (let turn = 0; turn < 10 && !appt; turn += 1) {
    appt = await findAppt();
    if (appt) break;

    const hasList = /(^|\n)\s*1[.)]/.test(last);
    let next: string;
    if (hasList) next = '1';
    else if (/confirm|reply\s*\*?\s*yes|\byes\b/i.test(last)) next = 'yes';
    else if (/special|which (type|doctor)|doctor/i.test(last)) next = speciality;
    else if (/date|which day|when/i.test(last)) next = addDaysUTC(todayUTC(), 1);
    else next = 'yes';
    last = await reply(next);
  }
  if (!appt) appt = await findAppt();

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  if (appt) {
    console.log(`✅ APPOINTMENT BOOKED`);
    console.log(`   Patient:  ${appt.patient.name} (${appt.patient.phone})`);
    console.log(`   Doctor:   Dr. ${appt.doctor.name} — ${appt.doctor.speciality}`);
    console.log(`   When:     ${appt.appointmentDate.toISOString().slice(0, 10)} ${appt.appointmentTime}`);
    console.log(`   Status:   ${appt.status}  ← shows in dashboard PENDING queue for admin approval`);
    const notif = await prisma.notification.findFirst({ where: { clinicId: CLINIC_ID, appointmentId: appt.id, type: 'APPOINTMENT_BOOKED' } });
    console.log(`   Dashboard notification: ${notif ? 'YES (APPOINTMENT_BOOKED)' : 'not found'}`);
  } else {
    console.log(`⚠️  No appointment was created — see transcript above for where the flow stopped.`);
  }
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  await prisma.$disconnect();
};

run().catch(async (err) => {
  console.error('\nDemo crashed:', err?.message ?? err);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
