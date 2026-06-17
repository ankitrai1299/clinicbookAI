/**
 * Full receptionist reliability test across 5 DIFFERENT patient numbers.
 * Drives each through the REAL signed webhook path and asserts every stage:
 *   Registration → Book → Speciality → Slot → Confirmation → Appointment(PENDING)
 *   → Dashboard visibility → Notification.
 *
 * Numbers are varied on purpose (different formats: +/spaces, bare digits,
 * different country-code shapes) to flush out any number that behaves
 * differently from Ankit. Self-cleaning.
 *
 *   Run (server must be running):  npx tsx scripts/prove5Patients.ts
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

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d = '') => { console.log(`   ${ok ? '✅' : '❌'} ${n}${d ? ` — ${d}` : ''}`); ok ? pass++ : fail++; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const todayUTC = () => new Date().toISOString().slice(0, 10);
const addDaysUTC = (s: string, n: number) => { const d = new Date(`${s}T00:00:00.000Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const sendInbound = async (from: string, text: string) => {
  const body = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: 'E', changes: [{ value: { messaging_product: 'whatsapp', metadata: { phone_number_id: process.env.PHONE_NUMBER_ID }, messages: [{ from, id: `wamid.P5_${from}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, timestamp: Math.floor(Date.now() / 1000).toString(), type: 'text', text: { body: text } }] } }] }]
  });
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (APP_SECRET) headers['x-hub-signature-256'] = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(body).digest('hex');
  return (await axios.post(WEBHOOK, body, { headers, validateStatus: () => true })).status;
};
const waitReply = async (to: string, after: Date) => {
  for (let i = 0; i < 30; i++) {
    const l = await prisma.whatsAppLog.findFirst({ where: { to, messageType: 'auto_reply', createdAt: { gt: after } }, orderBy: { createdAt: 'desc' } });
    if (l) return l.body; await sleep(400);
  }
  return '';
};

interface Case { label: string; registeredPhone: string; inboundDigits: string; register: boolean; }

const runCase = async (c: Case, speciality: string) => {
  console.log(`\n=== ${c.label} | registered="${c.register ? c.registeredPhone : '(none — auto-onboard)'}" | inbound ${c.inboundDigits} ===`);
  const stages = { registration: false, reply: false, speciality: false, slot: false, confirmation: false, booking: false, dashboard: false, notification: false };

  let registeredId = '';
  if (c.register) {
    const p = await createPublicPatient(CLINIC_ID, { name: c.label, phone: c.registeredPhone, age: 28, gender: 'Other', healthConcern: 'Consultation' });
    registeredId = p.id;
    stages.registration = Boolean(p?.id);
  } else {
    stages.registration = true; // auto-onboard on first inbound is the "registration" for this path
  }

  const reply = async (t: string) => { const t0 = new Date(); const st = await sendInbound(c.inboundDigits, t); if (st !== 200) return `__HTTP_${st}__`; const r = await waitReply(c.inboundDigits, t0); console.log(`   👤 ${JSON.stringify(t)}  →  🤖 ${r.replace(/\n/g, ' ').slice(0, 78)}`); return r; };

  const r1 = await reply('hi');
  stages.reply = r1.length > 0 && !r1.startsWith('__HTTP_');

  // Match the PRODUCT's resolution logic: normalize on last-10 digits (a stored
  // number with internal spaces like "+91 91485 08511" won't substring-match the
  // contiguous digits, which is exactly what findOrCreatePatient guards against).
  const last10 = c.inboundDigits.slice(-10);
  const pidOf = async () => {
    const ps = await prisma.patient.findMany({ where: { clinicId: CLINIC_ID }, orderBy: { createdAt: 'desc' }, select: { id: true, phone: true } });
    return ps.find((p) => p.phone.replace(/\D/g, '').slice(-10) === last10)?.id ?? '';
  };

  let bookedId = '';
  let last = await reply('book appointment');
  for (let turn = 0; turn < 10 && !bookedId; turn++) {
    if (/special|cardio|dermat|pediat|ortho|physician|which (type|doctor)/i.test(last)) stages.speciality = true;
    if (/slot|available|\bAM\b|\bPM\b|which time|pick a time|times? (with|are)/i.test(last)) stages.slot = true;
    if (/confirm|reply\s*\*?\s*yes|please reply yes/i.test(last)) stages.confirmation = true;

    const pid = await pidOf();
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
  if (!bookedId) { const pid = await pidOf(); if (pid) { const a = await prisma.appointment.findFirst({ where: { clinicId: CLINIC_ID, patientId: pid } }); if (a) bookedId = a.id; } }
  stages.booking = Boolean(bookedId);

  if (bookedId) {
    const appt = await prisma.appointment.findUnique({ where: { id: bookedId }, include: { doctor: { select: { name: true, speciality: true } }, patient: { select: { name: true, phone: true } } } });
    stages.dashboard = appt?.status === 'PENDING'; // appears in dashboard PENDING queue
    const notif = await prisma.notification.findFirst({ where: { clinicId: CLINIC_ID, appointmentId: bookedId, type: 'APPOINTMENT_BOOKED' } });
    stages.notification = Boolean(notif);
    console.log(`   📋 ${appt?.patient?.name} → Dr. ${appt?.doctor?.name} (${appt?.doctor?.speciality}) ${appt?.appointmentDate.toISOString().slice(0,10)} ${appt?.appointmentTime} [${appt?.status}]`);

    // Duplicate guard: if registered, booking must attach to the registered record.
    const sameHuman = (await prisma.patient.findMany({ where: { clinicId: CLINIC_ID }, select: { id: true, phone: true } })).filter((p) => p.phone.replace(/\D/g, '').slice(-10) === c.inboundDigits.slice(-10));
    if (c.register) check(`${c.label}: no duplicate patient (booked on registered record)`, sameHuman.length === 1 && appt?.patientId === registeredId, `records=${sameHuman.length}`);
  }

  // Assert every required stage.
  check(`${c.label}: Registration`, stages.registration);
  check(`${c.label}: Reply`, stages.reply);
  check(`${c.label}: Speciality selection`, stages.speciality);
  check(`${c.label}: Slot selection`, stages.slot);
  check(`${c.label}: Confirmation`, stages.confirmation);
  check(`${c.label}: Appointment creation`, stages.booking);
  check(`${c.label}: Dashboard visibility (PENDING)`, stages.dashboard);
  check(`${c.label}: Notification`, stages.notification);

  return { inboundDigits: c.inboundDigits };
};

const cleanupByLast10 = async (last10: string) => {
  const pts = await prisma.patient.findMany({ where: { clinicId: CLINIC_ID }, select: { id: true, phone: true } });
  for (const p of pts.filter((x) => x.phone.replace(/\D/g, '').slice(-10) === last10)) {
    const appts = await prisma.appointment.findMany({ where: { patientId: p.id }, select: { id: true } });
    for (const a of appts) await prisma.notification.deleteMany({ where: { appointmentId: a.id } }).catch(() => undefined);
    await prisma.appointment.deleteMany({ where: { patientId: p.id } }).catch(() => undefined);
    const cvs = await prisma.aiConversation.findMany({ where: { patientId: p.id }, select: { id: true } });
    for (const cc of cvs) await prisma.aiMessage.deleteMany({ where: { conversationId: cc.id } }).catch(() => undefined);
    await prisma.aiConversation.deleteMany({ where: { patientId: p.id } }).catch(() => undefined);
    await prisma.patient.delete({ where: { id: p.id } }).catch(() => undefined);
  }
  await prisma.whatsAppLog.deleteMany({ where: { to: { contains: last10 } } }).catch(() => undefined);
};

const run = async () => {
  const health = await axios.get(`http://localhost:${PORT}/health`, { validateStatus: () => true }).catch(() => null);
  if (!health || health.status !== 200) throw new Error(`Backend not reachable on :${PORT}`);

  const doctors = await prisma.doctor.findMany({ where: { clinicId: CLINIC_ID }, select: { id: true, speciality: true } });
  let speciality = '';
  outer: for (let i = 0; i < 14; i++) { const date = addDaysUTC(todayUTC(), i); for (const d of doctors) { if ((await getAvailableSlots(CLINIC_ID, d.id, date)).length) { speciality = d.speciality.trim(); break outer; } } }
  if (!speciality) throw new Error('No open slots in next 14 days');
  console.log(`Server healthy. Speciality with availability: ${speciality}. Signature ${APP_SECRET ? 'ENABLED' : 'disabled'}.`);

  const s = Date.now().toString().slice(-6);
  // Each patient has a unique 10-digit national; the SAME national is delivered
  // by Meta as "91"+national, so last-10 matching must hold across formats.
  const nat = (i: number) => `9${i}${s}${i}${i}`; // 10 digits, distinct per i
  const cases: Case[] = [
    { label: `P1 ${s}`, registeredPhone: `+91 ${nat(1).slice(0, 5)} ${nat(1).slice(5)}`, inboundDigits: `91${nat(1)}`, register: true }, // formatted: + and spaces
    { label: `P2 ${s}`, registeredPhone: `+91${nat(2)}`,                                  inboundDigits: `91${nat(2)}`, register: true }, // + country code, no spaces
    { label: `P3 ${s}`, registeredPhone: `${nat(3)}`,                                     inboundDigits: `91${nat(3)}`, register: true }, // bare national, no country code
    { label: `P4 ${s}`, registeredPhone: `0${nat(4)}`,                                    inboundDigits: `91${nat(4)}`, register: true }, // leading-0 trunk prefix
    { label: `P5 ${s}`, registeredPhone: `(none)`,                                        inboundDigits: `91${nat(5)}`, register: false } // never registered → auto-onboard
  ];

  const last10s: string[] = [];
  try {
    for (const c of cases) { await runCase(c, speciality); last10s.push(c.inboundDigits.slice(-10)); }
  } finally {
    for (const l of last10s) await cleanupByLast10(l).catch(() => undefined);
  }

  console.log(`\n══════════════════════════════\nRESULT: ${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
};

run().catch(async (e) => { console.error('crashed:', e?.message ?? e); await prisma.$disconnect().catch(() => undefined); process.exit(1); });
