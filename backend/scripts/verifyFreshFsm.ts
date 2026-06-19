// ===========================================================================
// Post-cleanup verification: create ONE fresh test patient and drive the FULL
// deterministic FSM exactly as the inbound webhook would — one message at a
// time — through to a PENDING booking.
//
//   greeting → MENU → (1) SPECIALITY → (1) DOCTOR → (1) SLOT → (1) CONFIRM
//            → (YES) BOOKED [PENDING]
//
// Proves the FSM is intact after the test-data wipe: a session row is created
// and advances exactly one state per reply, doctors/slots come from the DB, the
// booking lands PENDING with a dashboard Notification, and ZERO AiConversation
// rows are written (LLM is not in the control loop).
//
//   ALLOW_FSM_SIM=1 npx tsx scripts/verifyFreshFsm.ts
// ===========================================================================
import { prisma } from '../src/config/prisma.js';
import { handleWhatsAppMessage } from '../src/modules/whatsapp/whatsapp.booking.js';

const FRESH_NAME = 'FSM Test Patient';
const FRESH_PHONE = '919000000001'; // not used by any real patient

const nextInput = (state: string): string => {
  switch (state) {
    case 'SPECIALITY_SELECTION':
    case 'DOCTOR_SELECTION':
    case 'SLOT_SELECTION':
      return '1';
    case 'CONFIRMATION':
      return 'YES';
    default:
      return '1';
  }
};

const main = async (): Promise<void> => {
  if (process.env.ALLOW_FSM_SIM !== '1') {
    console.error('Refusing to run: set ALLOW_FSM_SIM=1 to allow DB writes.');
    process.exit(1);
  }
  const clinicId = process.env.WHATSAPP_CLINIC_ID!;
  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { id: true, name: true } });
  if (!clinic) return console.error('Clinic not found.');

  // Clean any leftover from a prior run, then create the fresh patient.
  await prisma.whatsAppSession.deleteMany({ where: { phone: FRESH_PHONE } });
  const existing = await prisma.patient.findFirst({ where: { clinicId: clinic.id, phone: FRESH_PHONE } });
  if (existing) {
    await prisma.appointment.deleteMany({ where: { patientId: existing.id } });
    await prisma.patient.delete({ where: { id: existing.id } });
  }
  const patient = await prisma.patient.create({
    data: { clinicId: clinic.id, name: FRESH_NAME, phone: FRESH_PHONE, language: 'English', source: 'whatsapp' },
    select: { id: true, name: true, phone: true, patientCode: true }
  });
  console.log(`Clinic: "${clinic.name}" (${clinic.id})`);
  console.log(`Fresh test patient created: ${patient.name}  phone=${patient.phone}  id=${patient.id}\n`);

  const aiBefore = await prisma.aiConversation.count({ where: { patientId: patient.id } });

  const base = {
    clinicId: clinic.id,
    patientId: patient.id,
    patientName: patient.name,
    clinicName: clinic.name,
    phone: patient.phone,
    patientCode: patient.patientCode ?? null
  };

  let input = 'hi';
  let prevState = 'IDLE';
  const statesSeen: string[] = [];
  for (let step = 0; step < 10; step++) {
    const reply = await handleWhatsAppMessage({ ...base, message: input });
    const sess = await prisma.whatsAppSession.findUnique({ where: { phone: patient.phone } });
    const state = sess?.state ?? '(no session)';
    statesSeen.push(state);

    console.log(`PATIENT ▶ "${input}"`);
    console.log(reply.split('\n').map((l) => `    BOT │ ${l}`).join('\n'));
    console.log(`    [session=${sess ? 'EXISTS' : 'MISSING'}  state=${state}  one-step-advance=${state !== prevState}]\n`);

    prevState = state;
    if (state === 'BOOKED') break;
    input = nextInput(state);
  }

  // ---- Assertions ----------------------------------------------------------
  const aiAfter = await prisma.aiConversation.count({ where: { patientId: patient.id } });
  const appts = await prisma.appointment.findMany({
    where: { patientId: patient.id },
    include: { doctor: { select: { name: true, speciality: true } } }
  });
  const appt = appts[0];
  const notif = appt
    ? await prisma.notification.findFirst({ where: { clinicId: clinic.id, appointmentId: appt.id } })
    : null;

  console.log('──────── VERIFICATION RESULT ────────');
  console.log(`States traversed: ${statesSeen.join(' → ')}`);
  console.log(`Reached BOOKED:           ${statesSeen.includes('BOOKED') ? 'YES ✅' : 'NO ❌'}`);
  console.log(`Booking created:          ${appt ? `${appt.doctor?.name} (${appt.doctor?.speciality}) on ${appt.appointmentDate.toISOString().slice(0, 10)} at ${appt.appointmentTime}` : 'NONE ❌'}`);
  console.log(`Status PENDING:           ${appt?.status === 'PENDING' ? 'YES ✅' : `NO (${appt?.status}) ❌`}`);
  console.log(`Dashboard Notification:   ${notif ? `YES ✅ ("${notif.title}")` : 'NONE ❌'}`);
  console.log(`AiConversation rows (LLM not in loop): before=${aiBefore} after=${aiAfter} → new=${aiAfter - aiBefore} ${aiAfter - aiBefore === 0 ? '✅' : '❌'}`);

  console.log('\nLeft in place for inspection: the fresh test patient, its PENDING appointment, the notification and the FSM session.');
};

main()
  .catch((e) => {
    console.error('verify failed:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
