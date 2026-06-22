/**
 * LIVE-PIPELINE end-to-end test of the AI Receptionist + FSM, with BOTH flags ON
 * (WA_AI_RECEPTIONIST + WA_INTERACTIVE). Drives the EXACT function the WhatsApp
 * webhook calls — handleWhatsAppMessage — against the REAL DB and LIVE OpenAI, so
 * intent detection, FSM execution, DB validation, interactive rendering, audit
 * logging and handoff all run for real. It does NOT send over WhatsApp (no Meta
 * call): interactive replies are rendered to text and "taps" are simulated by
 * feeding the stable option id back in (replyId), exactly as the webhook does
 * when a patient taps a button/row.
 *
 * Proves the pre-prod checklist:
 *   2. WhatsAppAudit captured for every step (dumped per patient)
 *   3. AI NEVER books directly (appointment count stays 0 until explicit Confirm)
 *   4. Low-confidence fallback (garble → clarify, confidence < threshold)
 *   5. Interactive buttons/list payloads valid (WhatsApp length/count limits)
 *   6. Five full transcripts: new booking, reschedule, cancel, FAQ, human handoff
 *
 * Items 1 & 5-on-device (real multi-handset delivery + visual render) require
 * your phones against the deployed Meta number — see the manual checklist printed
 * at the end.
 *
 *   Run:  npx tsx scripts/testReceptionistE2E.ts
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Turn the receptionist + interactive rendering ON for this run only (does NOT
// touch .env — production stays however it is configured).
process.env.WA_AI_RECEPTIONIST = 'true';
process.env.WA_INTERACTIVE = 'true';

const { prisma } = await import('../src/config/prisma.js');
const { handleWhatsAppMessage } = await import('../src/modules/whatsapp/whatsapp.booking.js');
const { isInteractive, botReplyText, RID } = await import('../src/modules/whatsapp/whatsapp.reply.js');
const { getAvailableSlots } = await import('../src/services/scheduling.service.js');

type Reply = Awaited<ReturnType<typeof handleWhatsAppMessage>>;

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`   ${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? (pass += 1) : (fail += 1);
};

const todayUTC = () => new Date().toISOString().slice(0, 10);
const addDaysUTC = (s: string, n: number) => {
  const d = new Date(`${s}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

interface P {
  id: string;
  name: string;
  phone: string;
  patientCode: string | null;
}

const makePatient = async (clinicId: string, label: string, n: number): Promise<P> => {
  const phone = `1555${String(Date.now()).slice(-6)}${n}${Math.floor(Math.random() * 9)}`;
  return prisma.patient.create({
    data: { clinicId, name: `E2E ${label}`, phone, language: 'English', source: 'whatsapp' },
    select: { id: true, name: true, phone: true, patientCode: true }
  });
};

// --- interactive reply helpers -------------------------------------------
const rows = (r: Reply): Array<{ id: string; title: string }> => {
  if (!r || !isInteractive(r)) return [];
  return r.kind === 'list' ? r.rows : r.buttons;
};
const bodyOf = (r: Reply): string => (r === null ? '' : typeof r === 'string' ? r : r.body);
const firstOpt = (r: Reply): string | undefined => rows(r).find((x) => x.id.startsWith('OPT_'))?.id;
const optByTitle = (r: Reply, re: RegExp): string | undefined => rows(r).find((x) => re.test(x.title))?.id;
const hasButton = (r: Reply, id: string): boolean => rows(r).some((x) => x.id === id);
const titleOf = (r: Reply, id: string): string => rows(r).find((x) => x.id === id)?.title ?? id;

// Validate a reply against WhatsApp's interactive limits.
const validateInteractive = (r: Reply): string[] => {
  if (!r || !isInteractive(r)) return [];
  const issues: string[] = [];
  if (r.kind === 'buttons') {
    if (r.buttons.length > 3) issues.push(`>3 buttons (${r.buttons.length})`);
    r.buttons.forEach((b) => b.title.length > 20 && issues.push(`button title >20: "${b.title}"`));
  } else {
    if (r.rows.length > 10) issues.push(`>10 rows (${r.rows.length})`);
    if (r.button.length > 20) issues.push(`list button >20: "${r.button}"`);
    r.rows.forEach((x) => {
      if (x.title.length > 24) issues.push(`row title >24: "${x.title}"`);
      if (x.description && x.description.length > 72) issues.push(`row desc >72: "${x.description}"`);
    });
  }
  if (r.body.length > 1024) issues.push('body >1024');
  return issues;
};

let renderIssues = 0;
const render = (r: Reply): string => {
  if (r === null) return '(no reply — stays silent)';
  if (typeof r === 'string') return r;
  const issues = validateInteractive(r);
  if (issues.length) {
    renderIssues += issues.length;
    return `${botReplyText(r)}\n   ⚠️ RENDER ISSUES: ${issues.join('; ')}`;
  }
  const kind = r.kind === 'buttons' ? 'BUTTONS' : 'LIST';
  return `${botReplyText(r)}\n   ‹${kind}: ${rows(r).map((x) => x.id).join(', ')}›`;
};

const countActive = (p: P) =>
  prisma.appointment.count({ where: { patientId: p.id, status: { in: ['PENDING', 'CONFIRMED'] } } });

const dumpAudit = async (p: P) => {
  const auditRows = await prisma.whatsAppAudit.findMany({ where: { phone: p.phone }, orderBy: { createdAt: 'asc' } });
  console.log(`\n   📋 WhatsAppAudit for ${p.name} — ${auditRows.length} row(s):`);
  for (const a of auditRows) {
    console.log(
      `      • "${a.message}" | intent=${a.intent ?? '-'} conf=${a.confidence ?? '-'} spec=${a.speciality ?? '-'} | ` +
        `${a.fsmStateFrom}→${a.fsmStateTo} | action=${a.action ?? '-'} | src=${a.source}`
    );
  }
  return auditRows;
};

const cleanup = async (clinicId: string, p: P) => {
  const appts = await prisma.appointment.findMany({ where: { patientId: p.id }, select: { id: true } });
  for (const a of appts) await prisma.notification.deleteMany({ where: { appointmentId: a.id } }).catch(() => undefined);
  await prisma.appointment.deleteMany({ where: { patientId: p.id } }).catch(() => undefined);
  await prisma.notification
    .deleteMany({ where: { clinicId, type: 'SYSTEM_ALERT', body: { contains: p.phone } } })
    .catch(() => undefined);
  await prisma.whatsAppAudit.deleteMany({ where: { phone: p.phone } }).catch(() => undefined);
  await prisma.whatsAppSession.deleteMany({ where: { phone: p.phone } }).catch(() => undefined);
  await prisma.patient.delete({ where: { id: p.id } }).catch(() => undefined);
};

const run = async () => {
  const clinicId = process.env.WHATSAPP_CLINIC_ID;
  if (!clinicId) throw new Error('WHATSAPP_CLINIC_ID is not set in backend/.env');
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required (AI receptionist mode)');

  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { name: true } });
  if (!clinic) throw new Error(`No clinic for WHATSAPP_CLINIC_ID=${clinicId}`);
  const clinicName = clinic.name;
  console.log(`Clinic under test: ${clinicName} (${clinicId})`);
  console.log('Flags: WA_AI_RECEPTIONIST=true, WA_INTERACTIVE=true\n');

  // Find a speciality + earliest date that actually has open slots.
  const doctors = await prisma.doctor.findMany({ where: { clinicId }, select: { id: true, speciality: true } });
  let speciality = '';
  let bookDate = '';
  outer: for (let i = 0; i < 21; i += 1) {
    const date = addDaysUTC(todayUTC(), i);
    for (const d of doctors) {
      if ((await getAvailableSlots(clinicId, d.id, date)).length > 0) {
        speciality = d.speciality.trim();
        bookDate = date;
        break outer;
      }
    }
  }
  if (!speciality) throw new Error('No open slots in the next 21 days — cannot run booking scenarios.');
  const offset = Math.round((Date.parse(`${bookDate}T00:00:00Z`) - Date.parse(`${todayUTC()}T00:00:00Z`)) / 86_400_000);
  const datePhrase = offset === 0 ? 'today' : offset === 1 ? 'tomorrow' : `on ${bookDate}`;
  console.log(`Will book speciality "${speciality}", first availability ${bookDate} (${datePhrase}).\n`);

  const A = await makePatient(clinicId, 'New-Booking', 1);
  const B = await makePatient(clinicId, 'Cancel', 2);
  const C = await makePatient(clinicId, 'FAQ-Handoff', 3);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const say = async (p: P, opts: { message?: string; replyId?: string; label?: string }): Promise<Reply> => {
    // Mirror the webhook: a tapped button/row carries its TITLE as the inbound
    // text plus the stable id as replyId.
    const message = opts.message ?? opts.label ?? '(tap)';
    const reply = await handleWhatsAppMessage({
      clinicId,
      patientId: p.id,
      patientName: p.name,
      clinicName,
      phone: p.phone,
      patientCode: p.patientCode,
      message,
      replyId: opts.replyId
    });
    console.log(`\n👤 ${opts.replyId ? `[tapped: ${opts.label ?? opts.replyId}]` : message}`);
    console.log(`🤖 ${render(reply)}`);
    // The FSM writes WhatsAppAudit fire-and-forget; let it commit before we read.
    await sleep(300);
    return reply;
  };

  // Advance through speciality→doctor→slot list taps until a Confirm button
  // appears, asserting NO appointment is created along the way.
  const advanceToConfirm = async (p: P, r: Reply): Promise<Reply> => {
    let guard = 0;
    while (r && isInteractive(r) && !hasButton(r, RID.CONF_YES) && guard < 6) {
      guard += 1;
      const id = optByTitle(r, new RegExp(speciality, 'i')) ?? firstOpt(r);
      if (!id) break;
      r = await say(p, { replyId: id, label: titleOf(r, id) });
    }
    return r;
  };

  try {
    // ===================================================================
    console.log('\n══════════ SCENARIO 1 — NEW BOOKING (Patient A) ══════════');
    let r = await say(A, { message: 'hi' });
    check('Greeting → interactive menu list', isInteractive(r) && r.kind === 'list');

    r = await say(A, { message: `I'd like to book a ${speciality} appointment ${datePhrase}` });
    const aud1a = await prisma.whatsAppAudit.findFirst({
      where: { phone: A.phone },
      orderBy: { createdAt: 'desc' }
    });
    check('AI understood BOOK intent', aud1a?.intent === 'book', `intent=${aud1a?.intent} conf=${aud1a?.confidence}`);
    check('AI did NOT book directly (0 appts after routing)', (await countActive(A)) === 0);

    // Mid-flow abort: patient changes their mind during slot selection.
    const rAbort = await say(A, { message: 'cancel kro nahi karna' });
    check(
      'Mid-flow "cancel/nahi karna" aborts to menu (not stuck on number prompt)',
      /stopped that/i.test(botReplyText(rAbort)) && /help you/i.test(botReplyText(rAbort))
    );
    check('Abort created no appointment', (await countActive(A)) === 0);
    // Re-enter the booking flow to finish the scenario.
    r = await say(A, { message: `book a ${speciality} appointment ${datePhrase}` });

    r = await advanceToConfirm(A, r);
    check('AI did NOT book during slot selection (0 appts at confirm)', (await countActive(A)) === 0);
    check('Confirmation step shows Confirm/Change buttons', hasButton(r, RID.CONF_YES));

    if (hasButton(r, RID.CONF_YES)) r = await say(A, { replyId: RID.CONF_YES, label: '✅ Confirm' });
    const bookedCount = await countActive(A);
    check('Appointment created ONLY after explicit Confirm', bookedCount === 1, `${bookedCount} active`);
    const apptA = await prisma.appointment.findFirst({ where: { patientId: A.id }, include: { doctor: true } });
    check('Status is PENDING (never auto-CONFIRMED)', apptA?.status === 'PENDING', `status=${apptA?.status}`);
    await dumpAudit(A);

    // ===================================================================
    console.log('\n══════════ SCENARIO 2 — RESCHEDULE (Patient A) ══════════');
    r = await say(A, { message: 'I need to reschedule my appointment to another day' });
    const aud2 = await prisma.whatsAppAudit.findFirst({ where: { phone: A.phone }, orderBy: { createdAt: 'desc' } });
    check('AI understood RESCHEDULE intent', aud2?.intent === 'reschedule', `intent=${aud2?.intent}`);
    if (firstOpt(r)) r = await say(A, { replyId: firstOpt(r)!, label: 'appointment #1' });
    // pick a different slot if possible (2nd), else first
    const slotIds = rows(r).filter((x) => x.id.startsWith('OPT_'));
    const slotPick = slotIds[1]?.id ?? slotIds[0]?.id;
    if (slotPick) r = await say(A, { replyId: slotPick, label: titleOf(r, slotPick) });
    if (hasButton(r, RID.CONF_YES)) r = await say(A, { replyId: RID.CONF_YES, label: '✅ Confirm' });
    const aud2done = await prisma.whatsAppAudit.findFirst({ where: { phone: A.phone }, orderBy: { createdAt: 'desc' } });
    check('Reschedule executed by FSM (action=reschedule)', aud2done?.action === 'reschedule', `action=${aud2done?.action}`);
    check('Still exactly 1 active appointment (moved, not duplicated)', (await countActive(A)) === 1);
    await dumpAudit(A);

    // ===================================================================
    console.log('\n══════════ SCENARIO 3 — CANCEL (Patient B) ══════════');
    // First give B an appointment via the booking flow.
    let rb = await say(B, { message: `book a ${speciality} appointment ${datePhrase}` });
    rb = await advanceToConfirm(B, rb);
    if (hasButton(rb, RID.CONF_YES)) rb = await say(B, { replyId: RID.CONF_YES, label: '✅ Confirm' });
    check('Patient B has an appointment to cancel', (await countActive(B)) === 1);

    rb = await say(B, { message: 'I want to cancel my appointment' });
    const aud3 = await prisma.whatsAppAudit.findFirst({ where: { phone: B.phone }, orderBy: { createdAt: 'desc' } });
    check('AI understood CANCEL intent', aud3?.intent === 'cancel', `intent=${aud3?.intent}`);
    check('AI did NOT cancel directly (still 1 active before confirm)', (await countActive(B)) === 1);
    if (firstOpt(rb)) rb = await say(B, { replyId: firstOpt(rb)!, label: 'appointment #1' });
    if (hasButton(rb, RID.CONF_YES)) rb = await say(B, { replyId: RID.CONF_YES, label: 'Yes, cancel' });
    check('Cancellation executed by FSM (0 active after confirm)', (await countActive(B)) === 0);
    await dumpAudit(B);

    // ===================================================================
    console.log('\n══════════ SCENARIO 4 — FAQ (Patient C) ══════════');
    const rc1 = await say(C, { message: 'what can you help me with?' });
    const aud4 = await prisma.whatsAppAudit.findFirst({ where: { phone: C.phone }, orderBy: { createdAt: 'desc' } });
    check('FAQ answered then menu shown (action=faq)', aud4?.action === 'faq', `action=${aud4?.action}`);
    check('FAQ created no appointment', (await countActive(C)) === 0);
    void rc1;

    // ---- Low-confidence fallback (checklist item 4) ----
    console.log('\n── Low-confidence fallback ──');
    const rGarble = await say(C, { message: 'qwfp zxcv blarg mmm' });
    const audLC = await prisma.whatsAppAudit.findFirst({ where: { phone: C.phone }, orderBy: { createdAt: 'desc' } });
    const min = Number(process.env.WA_AI_CONFIDENCE_MIN ?? 0.6);
    check(
      'Garble → clarify or handoff (no flow entered), low confidence',
      audLC?.action === 'clarify' || audLC?.action === 'handoff' || (audLC?.confidence ?? 1) < min,
      `action=${audLC?.action} conf=${audLC?.confidence}`
    );
    check('Low-confidence created no appointment', (await countActive(C)) === 0);

    // ===================================================================
    console.log('\n══════════ SCENARIO 5 — HUMAN HANDOFF (Patient C) ══════════');
    const rc2 = await say(C, { message: 'can I please talk to a real person at the clinic' });
    const aud5 = await prisma.whatsAppAudit.findFirst({ where: { phone: C.phone }, orderBy: { createdAt: 'desc' } });
    check('AI routed to HANDOFF (action=handoff)', aud5?.action === 'handoff', `action=${aud5?.action}`);
    check('FSM moved to HUMAN_HANDOFF state', aud5?.fsmStateTo === 'HUMAN_HANDOFF', `to=${aud5?.fsmStateTo}`);
    const notif = await prisma.notification.findFirst({
      where: { clinicId, type: 'SYSTEM_ALERT', body: { contains: C.phone } }
    });
    check('Staff dashboard notification created', Boolean(notif));
    // After handoff, non-greeting chatter stays silent; a greeting re-engages.
    const silent = await say(C, { message: 'are you there?' });
    check('Post-handoff chatter stays silent (no reply)', silent === null);
    void rc2;
    await dumpAudit(C);

    // ===================================================================
    console.log('\n══════════ CROSS-CUTTING CHECKS ══════════');
    check('3 distinct patients exercised', new Set([A.id, B.id, C.id]).size === 3);
    check('All interactive payloads within WhatsApp limits', renderIssues === 0, `${renderIssues} issue(s)`);
  } finally {
    console.log('\nCleaning up throwaway patients…');
    await cleanup(clinicId, A);
    await cleanup(clinicId, B);
    await cleanup(clinicId, C);
  }

  console.log(`\n──────────────────────────────\nRESULT: ${pass} passed, ${fail} failed`);
  console.log(
    '\nMANUAL (requires your phones + deployed Meta number, cannot be automated here):\n' +
      '  • Item 1: have 3 different patients message the live number; confirm each gets replies.\n' +
      '  • Item 5: confirm buttons & list messages render/tap correctly on the WhatsApp app.\n' +
      '  Only after BOTH pass, set WA_AI_RECEPTIONIST=true and WA_INTERACTIVE=true in prod,\n' +
      '  then rebuild dist + restart (prod runs compiled dist/).'
  );
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
};

run().catch(async (err) => {
  console.error('\nTest crashed:', err?.message ?? err);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
