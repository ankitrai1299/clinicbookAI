/**
 * P1-2: the patient must NEVER see raw DB enums (PENDING/CONFIRMED/…). Drives a
 * real booking through the FSM to confirmation, then "My appointments", and
 * asserts the outgoing text uses friendly wording and contains no raw enum.
 *
 *   Run:  npx tsx scripts/testPatientCopy.ts
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
process.env.WA_INTERACTIVE = 'true';

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient({ log: [] });
const { handleWhatsAppMessage, friendlyStatus } = await import('../src/modules/whatsapp/whatsapp.booking.js');
const { botReplyText } = await import('../src/modules/whatsapp/whatsapp.reply.js');

let pass = 0, fail = 0;
const ok = (cond: boolean, msg: string) => { if (cond) { pass++; console.log(`  ✓ ${msg}`); } else { fail++; console.error(`  ✗ ${msg}`); } };
const RAW_ENUMS = ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];
const hasRawEnum = (s: string) => RAW_ENUMS.some((e) => s.includes(e));

const clinicId = process.env.WHATSAPP_CLINIC_ID!;
const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { name: true } });
const phone = '910000006666';
let patient = await prisma.patient.findFirst({ where: { clinicId, phone } });
if (!patient) patient = await prisma.patient.create({ data: { clinicId, phone, name: 'TEST Copy', language: 'English', source: 'whatsapp' } });

const send = (msg: string, replyId?: string) =>
  handleWhatsAppMessage({ clinicId, patientId: patient!.id, patientName: patient!.name, clinicName: clinic?.name ?? 'Clinic', phone, message: msg, replyId });

const run = async () => {
  console.log('friendlyStatus mapping:');
  ok(friendlyStatus('PENDING') === 'Awaiting Clinic Confirmation', 'PENDING → Awaiting Clinic Confirmation');
  ok(friendlyStatus('CONFIRMED') === 'Confirmed', 'CONFIRMED → Confirmed');
  ok(friendlyStatus('COMPLETED') === 'Completed', 'COMPLETED → Completed');
  ok(friendlyStatus('CANCELLED') === 'Cancelled', 'CANCELLED → Cancelled');

  console.log('\nLive FSM booking → confirmation reply (no raw enum):');
  await prisma.appointment.deleteMany({ where: { patientId: patient!.id } });
  await prisma.whatsAppSession.deleteMany({ where: { phone } });
  await send('1', 'MENU_BOOK');                 // book
  await send('General Physician', 'OPT_2');     // speciality → single doctor → date picker
  await send('Tomorrow', 'OPT_2');              // pick a date (option 2 = tomorrow, always future)
  await send('first slot', 'OPT_1');            // pick a slot → CONFIRM
  const confirmReply = await send('yes', 'CONF_YES'); // confirm → booking created
  const confirmText = botReplyText(confirmReply as any);
  console.log('   reply:', confirmText.replace(/\n/g, ' | '));
  ok(!hasRawEnum(confirmText), 'Booking confirmation contains NO raw enum');
  ok(confirmText.includes('Awaiting Clinic Confirmation'), 'Booking confirmation shows "Awaiting Clinic Confirmation"');

  console.log('\nLive "My appointments" reply (no raw enum):');
  const checkReply = await send('2', 'MENU_APPTS');
  const checkText = botReplyText(checkReply as any);
  console.log('   reply:', checkText.replace(/\n/g, ' | '));
  ok(!hasRawEnum(checkText), 'Appointment list contains NO raw enum (e.g. no "[PENDING]")');

  // cleanup
  await prisma.appointment.deleteMany({ where: { patientId: patient!.id } });
  await prisma.whatsAppSession.deleteMany({ where: { phone } });

  console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILED'} — ${pass} passed, ${fail} failed`);
};

run().catch((e) => { console.error(e); fail++; }).finally(async () => { await prisma.$disconnect(); process.exit(fail === 0 ? 0 : 1); });
