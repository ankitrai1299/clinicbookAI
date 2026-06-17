/**
 * Proves real-time dashboard updates: opens the SSE stream the dashboard uses,
 * drives a real booking through the webhook, and asserts an APPOINTMENT_BOOKED
 * event is PUSHED on the stream (no polling) within seconds of the booking.
 *
 *   Run (server must be running):  npx tsx scripts/verifyRealtime.ts
 */
import path from 'path';
import crypto from 'crypto';
import http from 'http';
import { fileURLToPath } from 'url';

import axios from 'axios';
import dotenv from 'dotenv';

import { prisma } from '../src/config/prisma.js';
import { signAccessToken } from '../src/config/jwt.js';
import { getAvailableSlots } from '../src/services/scheduling.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const PORT = Number(process.env.PORT ?? '4000');
const APP_SECRET = process.env.WHATSAPP_APP_SECRET ?? '';
const CLINIC_ID = process.env.WHATSAPP_CLINIC_ID!;
let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d = '') => { console.log(`${ok ? '✅' : '❌'} ${n}${d ? ` — ${d}` : ''}`); ok ? pass++ : fail++; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const todayUTC = () => new Date().toISOString().slice(0, 10);
const addDaysUTC = (s: string, n: number) => { const d = new Date(`${s}T00:00:00.000Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const sendInbound = async (from: string, text: string) => {
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: 'E', changes: [{ value: { messaging_product: 'whatsapp', metadata: { phone_number_id: process.env.PHONE_NUMBER_ID }, messages: [{ from, id: `wamid.RT_${from}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, timestamp: Math.floor(Date.now() / 1000).toString(), type: 'text', text: { body: text } }] } }] }] });
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (APP_SECRET) headers['x-hub-signature-256'] = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(body).digest('hex');
  return (await axios.post(`http://localhost:${PORT}/api/whatsapp/webhook`, body, { headers, validateStatus: () => true })).status;
};

const run = async () => {
  const admin = await prisma.user.findFirst({ where: { clinicId: CLINIC_ID }, select: { id: true, email: true, role: true, clinicId: true } });
  if (!admin) throw new Error('no admin');
  const token = signAccessToken({ userId: admin.id, clinicId: admin.clinicId, email: admin.email, role: admin.role });

  // 1) Reject without token.
  const unauth = await new Promise<number>((resolve) => {
    const r = http.get({ host: 'localhost', port: PORT, path: '/api/notifications/stream' }, (res) => { resolve(res.statusCode ?? 0); res.destroy(); });
    r.on('error', () => resolve(0));
  });
  check('SSE stream rejects without token', unauth === 401, `HTTP ${unauth}`);

  // 2) Open the authenticated SSE stream and collect events as they're pushed.
  const events: { event: string; data: string; at: number }[] = [];
  let connected = false;
  const req = http.get({ host: 'localhost', port: PORT, path: `/api/notifications/stream?token=${encodeURIComponent(token)}` }, (res) => {
    check('SSE stream connects with token (200, text/event-stream)', res.statusCode === 200 && String(res.headers['content-type']).includes('text/event-stream'), `HTTP ${res.statusCode}`);
    let buf = '';
    res.setEncoding('utf8');
    res.on('data', (chunk: string) => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const raw = buf.slice(0, idx); buf = buf.slice(idx + 2);
        const ev = /event: (.*)/.exec(raw)?.[1]?.trim();
        const dt = /data: (.*)/.exec(raw)?.[1]?.trim();
        if (ev) { events.push({ event: ev, data: dt ?? '', at: Date.now() }); if (ev === 'connected') connected = true; }
      }
    });
  });
  req.on('error', (e) => console.error('SSE error', e.message));
  for (let i = 0; i < 20 && !connected; i++) await sleep(150);
  check('SSE handshake received (connected event)', connected);

  // 3) Pick a speciality/date with availability and drive a REAL booking,
  //    reading the bot's replies so the conversation actually completes.
  const doctors = await prisma.doctor.findMany({ where: { clinicId: CLINIC_ID }, select: { id: true, speciality: true } });
  let speciality = '', bookDate = '';
  outer: for (let i = 0; i < 14; i++) { const date = addDaysUTC(todayUTC(), i); for (const d of doctors) { if ((await getAvailableSlots(CLINIC_ID, d.id, date)).length) { speciality = d.speciality.trim(); bookDate = date; break outer; } } }

  const from = `9196${Date.now().toString().slice(-8)}`;
  const waitReply = async (after: Date) => { for (let i = 0; i < 25; i++) { const l = await prisma.whatsAppLog.findFirst({ where: { to: from, messageType: 'auto_reply', createdAt: { gt: after } }, orderBy: { createdAt: 'desc' } }); if (l) return l.body; await sleep(400); } return ''; };
  const say = async (text: string) => { const ts = new Date(); await sendInbound(from, text); const r = await waitReply(ts); console.log(`   👤 ${JSON.stringify(text)} → 🤖 ${r.replace(/\n/g, ' ').slice(0, 64)}`); return r; };

  const pidOf = async () => (await prisma.patient.findFirst({ where: { clinicId: CLINIC_ID, phone: { contains: from.slice(-10) } }, select: { id: true } }))?.id ?? '';

  const tBook = Date.now();
  await say('hi');
  let last = await say(`book a ${speciality} appointment on ${bookDate}`);
  let bookedId = '';
  for (let turn = 0; turn < 9 && !bookedId; turn++) {
    const pid = await pidOf();
    if (pid) { const a = await prisma.appointment.findFirst({ where: { clinicId: CLINIC_ID, patientId: pid } }); if (a) { bookedId = a.id; break; } }
    const hasList = /(^|\n)\s*1[.)]/.test(last);
    let next: string;
    if (hasList) next = '1';
    else if (/confirm|reply\s*\*?\s*yes|\byes\b/i.test(last)) next = 'yes';
    else if (/date|which day|when/i.test(last)) next = bookDate;
    else if (/special|which (type|doctor)|doctor/i.test(last)) next = speciality;
    else next = 'yes';
    last = await say(next);
  }
  if (!bookedId) { const pid = await pidOf(); if (pid) { const a = await prisma.appointment.findFirst({ where: { clinicId: CLINIC_ID, patientId: pid } }); if (a) bookedId = a.id; } }
  check('Booking completed (so there is something to push)', Boolean(bookedId), bookedId);

  // 4) Assert the APPOINTMENT_BOOKED event was PUSHED over SSE in real time.
  let booked = events.find((e) => e.event === 'notification' && /APPOINTMENT_BOOKED/.test(e.data));
  for (let i = 0; i < 16 && !booked; i++) { await sleep(500); booked = events.find((e) => e.event === 'notification' && /APPOINTMENT_BOOKED/.test(e.data)); }
  check('APPOINTMENT_BOOKED pushed over SSE in real time', Boolean(booked), booked ? `latency ~${((booked.at - tBook) / 1000).toFixed(1)}s` : `events: ${events.map((e) => e.event).join(',')}`);
  if (booked) console.log('   pushed:', booked.data.slice(0, 150));

  req.destroy();

  // cleanup
  const pts = await prisma.patient.findMany({ where: { clinicId: CLINIC_ID }, select: { id: true, phone: true } });
  for (const p of pts.filter((x) => x.phone.replace(/\D/g, '').slice(-10) === from.slice(-10))) {
    const appts = await prisma.appointment.findMany({ where: { patientId: p.id }, select: { id: true } });
    for (const a of appts) await prisma.notification.deleteMany({ where: { appointmentId: a.id } }).catch(() => undefined);
    await prisma.appointment.deleteMany({ where: { patientId: p.id } }).catch(() => undefined);
    const cvs = await prisma.aiConversation.findMany({ where: { patientId: p.id }, select: { id: true } });
    for (const c of cvs) await prisma.aiMessage.deleteMany({ where: { conversationId: c.id } }).catch(() => undefined);
    await prisma.aiConversation.deleteMany({ where: { patientId: p.id } }).catch(() => undefined);
    await prisma.patient.delete({ where: { id: p.id } }).catch(() => undefined);
  }
  await prisma.whatsAppLog.deleteMany({ where: { to: { contains: from.slice(-10) } } }).catch(() => undefined);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
};

run().catch(async (e) => { console.error('crashed:', e?.message ?? e); await prisma.$disconnect().catch(() => undefined); process.exit(1); });
