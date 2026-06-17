/**
 * REAL end-to-end conversation test against the verified WhatsApp recipients
 * (Ankit, Piyush, Anish, + any extra national numbers passed as argv).
 *
 * For EACH number it drives the full flow through the REAL backend:
 *   signed* webhook POST → controller → patient resolution → AI receptionist →
 *   booking (PENDING) → REAL WhatsApp reply SENT to the phone → dashboard
 *   notification. (*signature only if WHATSAPP_APP_SECRET is set.)
 *
 * The only synthesized part is the inbound text (we POST it to /webhook the way
 * Meta would). Outbound replies are really sent to the patient's phone.
 *
 * Because these recipients ALREADY have appointments, the test snapshots the
 * pre-existing appointment IDs and only treats a NEW id as "booked" — then,
 * with --clean, surgically deletes ONLY what this run created (the new
 * appointment + its notifications + AI messages + logs after the run started),
 * leaving the patient record and original appointment untouched.
 *
 * Phases per number: welcome → webhook received → bot reply → speciality →
 * doctor/slot → confirmation → appointment created → dashboard notification →
 * appointment row in DB → no duplicate patient.
 *
 *   Run (server must be running):
 *     npx tsx scripts/e2eVerifiedRecipients.ts [--clean] [extraNationalNumber ...]
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

const argv = process.argv.slice(2);
const CLEAN = argv.includes('--clean');
const EXTRA = argv.filter((a) => !a.startsWith('--')).map((s) => s.replace(/\D/g, ''));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const todayUTC = () => new Date().toISOString().slice(0, 10);
const addDaysUTC = (s: string, n: number) => {
  const d = new Date(`${s}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const last10 = (s: string) => (s ?? '').replace(/\D/g, '').slice(-10);

// POST a Meta-shaped inbound text webhook, signed exactly like Meta signs it.
const sendInbound = async (fromDigits: string, text: string): Promise<number> => {
  const body = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'E2E',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: process.env.PHONE_NUMBER_ID },
              messages: [
                {
                  from: fromDigits,
                  id: `wamid.E2E_${fromDigits}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
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

// Read the most recent auto_reply we logged for this number, newer than t0.
const waitForReply = async (toDigits: string, after: Date): Promise<{ body: string; status: string } | null> => {
  for (let i = 0; i < 30; i += 1) {
    const l = await prisma.whatsAppLog.findFirst({
      where: { to: toDigits, messageType: 'auto_reply', createdAt: { gt: after } },
      orderBy: { createdAt: 'desc' }
    });
    if (l) return { body: l.body, status: l.status };
    await sleep(400);
  }
  return null;
};

interface Target {
  label: string;
  inbound: string; // full international digits, as Meta delivers
}

interface PhaseResult {
  webhook: boolean;
  reply: boolean;
  speciality: boolean;
  slot: boolean;
  confirmation: boolean;
  appointment: boolean;
  pending: boolean;
  notification: boolean;
  dbRow: boolean;
  noDuplicate: boolean;
  transcript: string[];
  notes: string[];
}

const runTarget = async (t: Target, speciality: string): Promise<PhaseResult> => {
  const res: PhaseResult = {
    webhook: false, reply: false, speciality: false, slot: false, confirmation: false,
    appointment: false, pending: false, notification: false, dbRow: false, noDuplicate: false,
    transcript: [], notes: []
  };
  const runStart = new Date();
  const key = last10(t.inbound);

  // Resolve the patient (must already exist as a verified recipient).
  const allPatients = await prisma.patient.findMany({ where: { clinicId: CLINIC_ID } });
  const patient = allPatients.find((p) => last10(p.phone) === key);
  if (!patient) {
    res.notes.push(`No patient record for ${t.inbound} in this clinic — will auto-onboard on first inbound.`);
  }
  const preApptIds = patient
    ? new Set((await prisma.appointment.findMany({ where: { clinicId: CLINIC_ID, patientId: patient.id }, select: { id: true } })).map((a) => a.id))
    : new Set<string>();
  const prePatientCount = allPatients.filter((p) => last10(p.phone) === key).length;

  const findNewAppt = async () => {
    const ap = await prisma.patient.findMany({ where: { clinicId: CLINIC_ID } });
    const me = ap.find((p) => last10(p.phone) === key);
    if (!me) return null;
    const appts = await prisma.appointment.findMany({
      where: { clinicId: CLINIC_ID, patientId: me.id },
      orderBy: { appointmentDate: 'desc' },
      include: { doctor: true, patient: true }
    });
    return appts.find((a) => !preApptIds.has(a.id)) ?? null;
  };

  const say = async (text: string): Promise<string> => {
    const t0 = new Date();
    const status = await sendInbound(t.inbound, text);
    res.transcript.push(`👤 PATIENT: ${text}`);
    if (status !== 200) {
      res.transcript.push(`   ⚠️  webhook returned HTTP ${status}`);
      return `__HTTP_${status}__`;
    }
    const r = await waitForReply(t.inbound, t0);
    if (!r) {
      res.transcript.push(`   🤖 BOT: (no reply within timeout)`);
      return '';
    }
    res.transcript.push(`   🤖 BOT${r.status === 'sent' ? ' (✅ sent to phone)' : ` (⚠️ ${r.status})`}: ${r.body.replace(/\n/g, ' ⏎ ')}`);
    return r.body;
  };

  // Phase 1-3: welcome / webhook received / bot reply.
  const welcome = await say('hi');
  res.webhook = !welcome.startsWith('__HTTP_'); // HTTP 200 => webhook accepted + processed
  res.reply = welcome.length > 0 && !welcome.startsWith('__HTTP_');

  // Phase 4-7: drive the booking with the numbered convenience layer.
  let last = await say('I want to book an appointment');
  let appt = await findNewAppt();
  for (let turn = 0; turn < 12 && !appt; turn += 1) {
    if (/special|cardio|dermat|pediat|ortho|physician|which (type|doctor)|choose a doctor/i.test(last)) res.speciality = true;
    if (/slot|available|\bAM\b|\bPM\b|which time|pick a time|time slot/i.test(last)) res.slot = true;
    if (/confirm|reply\s*\*?\s*yes|\byes\b|shall i|should i book/i.test(last)) res.confirmation = true;

    appt = await findNewAppt();
    if (appt) break;

    const hasList = /(^|\n)\s*1[.)]/.test(last);
    let next: string;
    if (/confirm|reply\s*\*?\s*yes|shall i|should i book/i.test(last)) next = 'yes';
    else if (hasList) next = '1';
    else if (/special|which (type|doctor)|choose a doctor|^.*doctor/i.test(last)) next = speciality;
    else if (/date|which day|when/i.test(last)) next = addDaysUTC(todayUTC(), 1);
    else next = 'yes';
    last = await say(next);
  }
  if (!appt) appt = await findNewAppt();

  if (appt) {
    res.appointment = true;
    res.dbRow = true;
    res.pending = appt.status === 'PENDING';
    res.notes.push(`Appt ${appt.id} — Dr. ${appt.doctor.name} (${appt.doctor.speciality}) ${appt.appointmentDate.toISOString().slice(0, 10)} ${appt.appointmentTime} status=${appt.status}`);

    const notif = await prisma.notification.findFirst({ where: { clinicId: CLINIC_ID, appointmentId: appt.id, type: 'APPOINTMENT_BOOKED' } });
    res.notification = Boolean(notif);

    const sameHuman = (await prisma.patient.findMany({ where: { clinicId: CLINIC_ID } })).filter((p) => last10(p.phone) === key);
    res.noDuplicate = sameHuman.length === prePatientCount && (!patient || appt.patientId === patient.id);
    res.notes.push(`Patient records for ${key}: was ${prePatientCount}, now ${sameHuman.length}${patient ? `; booking on ${appt.patientId === patient.id ? 'EXISTING' : 'DIFFERENT'} record` : ''}`);
  }

  // Surgical cleanup of ONLY what this run created.
  if (CLEAN) {
    if (appt) {
      await prisma.notification.deleteMany({ where: { appointmentId: appt.id } }).catch(() => undefined);
      await prisma.reminder.deleteMany({ where: { appointmentId: appt.id } }).catch(() => undefined);
      await prisma.appointment.delete({ where: { id: appt.id } }).catch(() => undefined);
    }
    if (patient) {
      const convos = await prisma.aiConversation.findMany({ where: { patientId: patient.id, channel: 'whatsapp' }, select: { id: true } });
      for (const c of convos) {
        await prisma.aiMessage.deleteMany({ where: { conversationId: c.id, createdAt: { gte: runStart } } }).catch(() => undefined);
      }
    }
    await prisma.whatsAppLog.deleteMany({ where: { to: { contains: key }, createdAt: { gte: runStart } } }).catch(() => undefined);
    res.notes.push('Cleaned up: new appointment + its notifications + AI messages + logs created during this run.');
  }

  return res;
};

const run = async () => {
  if (!CLINIC_ID) throw new Error('WHATSAPP_CLINIC_ID not set');
  const health = await axios.get(`http://localhost:${PORT}/health`, { validateStatus: () => true }).catch(() => null);
  if (!health || health.status !== 200) throw new Error(`Backend not reachable on :${PORT} — start it with "npm run dev"`);
  console.log(`Server healthy on :${PORT}. Signature ${APP_SECRET ? 'ENABLED' : 'DISABLED (no WHATSAPP_APP_SECRET)'}. Cleanup ${CLEAN ? 'ON' : 'OFF'}.`);

  // Pick a speciality that actually has open slots in the next 14 days.
  const doctors = await prisma.doctor.findMany({ where: { clinicId: CLINIC_ID }, select: { id: true, speciality: true } });
  let speciality = '';
  outer: for (let i = 0; i < 14; i += 1) {
    const date = addDaysUTC(todayUTC(), i);
    for (const d of doctors) {
      if ((await getAvailableSlots(CLINIC_ID, d.id, date)).length > 0) { speciality = d.speciality.trim(); break outer; }
    }
  }
  if (!speciality) throw new Error('No open slots in next 14 days — add doctor availability first.');
  console.log(`Using speciality with availability: ${speciality}\n`);

  const targets: Target[] = [
    { label: 'Ankit', inbound: '917903884686' },
    { label: 'Piyush', inbound: '917254863177' },
    { label: 'Anish', inbound: '918252317017' },
    ...EXTRA.map((d) => ({ label: `Extra ${d.slice(-4)}`, inbound: d.length >= 11 ? d : `91${d}` }))
  ];

  const results: Array<{ t: Target; r: PhaseResult }> = [];
  for (const t of targets) {
    console.log(`\n════════════════════════════════════════════`);
    console.log(`▶ ${t.label}  (inbound ${t.inbound})`);
    console.log(`════════════════════════════════════════════`);
    const r = await runTarget(t, speciality);
    for (const line of r.transcript) console.log('   ' + line);
    if (r.notes.length) console.log('   ── ' + r.notes.join('\n   ── '));
    results.push({ t, r });
  }

  // Report table.
  const yn = (b: boolean) => (b ? 'PASS' : 'FAIL');
  console.log(`\n\n══════════════ E2E REPORT ══════════════`);
  console.log(`Number (label)        | Webhook | Reply | Booking | Dashboard | Result`);
  console.log(`----------------------|---------|-------|---------|-----------|-------`);
  for (const { t, r } of results) {
    const booking = r.appointment && r.pending && r.noDuplicate && r.dbRow;
    const overall = r.webhook && r.reply && booking && r.notification;
    const cell = (s: string, w: number) => s.padEnd(w);
    console.log(
      `${cell(`${t.label} ${t.inbound}`, 21)}| ${cell(yn(r.webhook), 8)}| ${cell(yn(r.reply), 6)}| ${cell(yn(booking), 8)}| ${cell(yn(r.notification), 10)}| ${overall ? '✅ PASS' : '❌ FAIL'}`
    );
  }

  console.log(`\nLegend per phase (Booking = appointment created AND PENDING AND no-dup AND db row):`);
  for (const { t, r } of results) {
    console.log(`  ${t.label}: speciality=${yn(r.speciality)} slot=${yn(r.slot)} confirmation=${yn(r.confirmation)} appt=${yn(r.appointment)} pending=${yn(r.pending)} dbRow=${yn(r.dbRow)} noDup=${yn(r.noDuplicate)} notif=${yn(r.notification)}`);
  }

  const allPass = results.every(({ r }) => r.webhook && r.reply && r.appointment && r.pending && r.noDuplicate && r.dbRow && r.notification);
  console.log(`\nOVERALL: ${allPass ? '✅ ALL VERIFIED RECIPIENTS PASSED' : '❌ SOME RECIPIENTS FAILED — see above'}`);

  await prisma.$disconnect();
  process.exit(allPass ? 0 : 1);
};

run().catch(async (err) => {
  console.error('\nE2E crashed:', err?.stack ?? err?.message ?? err);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
