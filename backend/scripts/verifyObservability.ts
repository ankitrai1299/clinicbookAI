/**
 * Verifies the observability + reliability additions against the RUNNING server:
 *   - GET /api/whatsapp/debug (auth-protected) reports hits + last in/out + URL
 *   - the webhook hit counter increments on every POST
 *   - a real flow (hi → book → speciality → slot → yes) creates a PENDING
 *     appointment that is visible for the dashboard (+ notification)
 *
 * Drives the same signed-webhook path Meta uses. Self-cleaning.
 *   Run (server must be running):  npx tsx scripts/verifyObservability.ts
 */
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

import axios from 'axios';
import dotenv from 'dotenv';

import { prisma } from '../src/config/prisma.js';
import { signAccessToken } from '../src/config/jwt.js';
import { getAvailableSlots } from '../src/services/scheduling.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const PORT = process.env.PORT ?? '4000';
const BASE = `http://localhost:${PORT}`;
const WEBHOOK = `${BASE}/api/whatsapp/webhook`;
const DEBUG = `${BASE}/api/whatsapp/debug`;
const APP_SECRET = process.env.WHATSAPP_APP_SECRET ?? '';
const CLINIC_ID = process.env.WHATSAPP_CLINIC_ID!;

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d = '') => { console.log(`   ${ok ? '✅' : '❌'} ${n}${d ? ` — ${d}` : ''}`); ok ? pass++ : fail++; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const todayUTC = () => new Date().toISOString().slice(0, 10);
const addDaysUTC = (s: string, n: number) => { const d = new Date(`${s}T00:00:00.000Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const sendInbound = async (from: string, text: string) => {
  const body = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: 'E', changes: [{ value: { messaging_product: 'whatsapp', metadata: { phone_number_id: process.env.PHONE_NUMBER_ID }, messages: [{ from, id: `wamid.OBS_${from}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, timestamp: Math.floor(Date.now() / 1000).toString(), type: 'text', text: { body: text } }] } }] }]
  });
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (APP_SECRET) headers['x-hub-signature-256'] = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(body).digest('hex');
  return (await axios.post(WEBHOOK, body, { headers, validateStatus: () => true })).status;
};
const waitReply = async (to: string, after: Date) => {
  for (let i = 0; i < 25; i++) {
    const l = await prisma.whatsAppLog.findFirst({ where: { to, messageType: 'auto_reply', createdAt: { gt: after } }, orderBy: { createdAt: 'desc' } });
    if (l) return l.body; await sleep(400);
  }
  return '';
};

const run = async () => {
  const health = await axios.get(`${BASE}/health`, { validateStatus: () => true }).catch(() => null);
  if (!health || health.status !== 200) throw new Error(`Backend not reachable on ${BASE}`);

  // Mint an admin token the same way login does (signed with JWT_SECRET).
  const admin = await prisma.user.findFirst({ where: { clinicId: CLINIC_ID }, select: { id: true, email: true, role: true, clinicId: true } });
  if (!admin) throw new Error('No admin user for clinic');
  const token = signAccessToken({ userId: admin.id, clinicId: admin.clinicId, email: admin.email, role: admin.role });
  const auth = { headers: { Authorization: `Bearer ${token}` }, validateStatus: () => true } as const;

  // --- /debug auth gate ---
  const noAuth = await axios.get(DEBUG, { validateStatus: () => true });
  check('/debug requires auth (401 without token)', noAuth.status === 401, `HTTP ${noAuth.status}`);

  const before = await axios.get(DEBUG, auth);
  check('/debug returns 200 with token', before.status === 200, `HTTP ${before.status}`);
  const hitsBefore = before.data?.data?.totalWebhookHits ?? 0;
  console.log('\n   /debug BEFORE:', JSON.stringify(before.data.data));

  // Pick a speciality with availability.
  const doctors = await prisma.doctor.findMany({ where: { clinicId: CLINIC_ID }, select: { id: true, speciality: true } });
  let speciality = '';
  outer: for (let i = 0; i < 14; i++) { const date = addDaysUTC(todayUTC(), i); for (const d of doctors) { if ((await getAvailableSlots(CLINIC_ID, d.id, date)).length) { speciality = d.speciality.trim(); break outer; } } }

  // --- Drive the real flow ---
  const from = `9190${Date.now().toString().slice(-8)}`;
  console.log(`\n   Driving flow from ${from} (speciality ${speciality}):`);
  const reply = async (t: string) => { const t0 = new Date(); const st = await sendInbound(from, t); if (st !== 200) return `__HTTP_${st}__`; const r = await waitReply(from, t0); console.log(`      👤 ${JSON.stringify(t)}  →  🤖 ${r.replace(/\n/g, ' ').slice(0, 70)}`); return r; };

  const patient = await prisma.patient.findFirst({ where: { clinicId: CLINIC_ID, phone: { contains: from.slice(-10) } }, select: { id: true } });
  let pid = patient?.id ?? '';

  let last = await reply('hi');
  check('Flow: bot answered "hi"', last.length > 0 && !last.startsWith('__HTTP_'));
  last = await reply('book appointment');
  let bookedId = '';
  for (let turn = 0; turn < 9 && !bookedId; turn++) {
    if (!pid) { const p = await prisma.patient.findFirst({ where: { clinicId: CLINIC_ID, phone: { contains: from.slice(-10) } }, select: { id: true } }); pid = p?.id ?? ''; }
    if (pid) { const a = await prisma.appointment.findFirst({ where: { clinicId: CLINIC_ID, patientId: pid } }); if (a) { bookedId = a.id; break; } }
    const hasList = /(^|\n)\s*1[.)]/.test(last);
    let next: string;
    if (hasList) next = '1';
    else if (/confirm|reply\s*\*?\s*yes|\byes\b/i.test(last)) next = 'yes';
    else if (/special|which (type|doctor)|doctor/i.test(last)) next = speciality;
    else if (/date|which day|when/i.test(last)) next = addDaysUTC(todayUTC(), 1);
    else next = 'yes';
    last = await reply(next);
  }
  if (!pid) { const p = await prisma.patient.findFirst({ where: { clinicId: CLINIC_ID, phone: { contains: from.slice(-10) } }, select: { id: true } }); pid = p?.id ?? ''; }
  if (!bookedId && pid) { const a = await prisma.appointment.findFirst({ where: { clinicId: CLINIC_ID, patientId: pid } }); if (a) bookedId = a.id; }

  check('Booking created an appointment (PENDING)', Boolean(bookedId), bookedId);
  if (bookedId) {
    const appt = await prisma.appointment.findUnique({ where: { id: bookedId }, include: { doctor: { select: { name: true, speciality: true } }, patient: { select: { name: true } } } });
    check('Appointment status PENDING', appt?.status === 'PENDING', appt?.status);
    console.log(`      📋 Dashboard would show: ${appt?.patient?.name} → Dr. ${appt?.doctor?.name} (${appt?.doctor?.speciality}) ${appt?.appointmentDate.toISOString().slice(0,10)} ${appt?.appointmentTime} [${appt?.status}]`);
    const notif = await prisma.notification.findFirst({ where: { clinicId: CLINIC_ID, appointmentId: bookedId, type: 'APPOINTMENT_BOOKED' } });
    check('Dashboard notification created', Boolean(notif));
  }

  // --- /debug AFTER reflects the activity ---
  const after = await axios.get(DEBUG, auth);
  const d = after.data.data;
  console.log('\n   /debug AFTER:', JSON.stringify(d));
  check('Hit counter incremented', d.totalWebhookHits > hitsBefore, `${hitsBefore} → ${d.totalWebhookHits}`);
  check('Last inbound phone recorded', d.lastInboundPhone === from, d.lastInboundPhone);
  check('Last inbound message recorded', typeof d.lastInboundMessage === 'string' && d.lastInboundMessage.length > 0, d.lastInboundMessage);
  check('Last outbound reply recorded', typeof d.lastOutboundReply === 'string' && d.lastOutboundReply.length > 0);
  check('Webhook URL reported', typeof d.webhookUrlConfigured === 'string' && d.webhookUrlConfigured.includes('/api/whatsapp/webhook'), d.webhookUrlConfigured);
  check('Signature status reported', d.signatureVerification === 'ENABLED' || d.signatureVerification === 'DISABLED', d.signatureVerification);

  // cleanup
  if (pid) {
    const appts = await prisma.appointment.findMany({ where: { patientId: pid }, select: { id: true } });
    for (const a of appts) await prisma.notification.deleteMany({ where: { appointmentId: a.id } }).catch(() => undefined);
    await prisma.appointment.deleteMany({ where: { patientId: pid } }).catch(() => undefined);
    const cvs = await prisma.aiConversation.findMany({ where: { patientId: pid }, select: { id: true } });
    for (const c of cvs) await prisma.aiMessage.deleteMany({ where: { conversationId: c.id } }).catch(() => undefined);
    await prisma.aiConversation.deleteMany({ where: { patientId: pid } }).catch(() => undefined);
    await prisma.patient.delete({ where: { id: pid } }).catch(() => undefined);
  }
  await prisma.whatsAppLog.deleteMany({ where: { to: { contains: from.slice(-10) } } }).catch(() => undefined);
  await prisma.whatsAppConversation.deleteMany({ where: { phone: from } }).catch(() => undefined);

  console.log(`\n══════════════════════════════\nRESULT: ${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
};

run().catch(async (e) => { console.error('crashed:', e?.message ?? e); await prisma.$disconnect().catch(() => undefined); process.exit(1); });
