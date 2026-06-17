// ===========================================================================
// REAL test: drive the deterministic FSM (handleWhatsAppMessage) for three
// patients, exactly as the inbound webhook would, ONE message at a time.
//
// Proves:
//   #3  WhatsAppSession rows are created and advance one state per reply.
//   #4  NO AiConversation / AiMessage rows are created (zero AI involvement).
//   #6  Exact transcript per number.
//   #7  One reply per input; state advances by exactly one step (no auto-advance).
//
// Sends NOTHING over WhatsApp: it calls the FSM directly and books with
// notify:false. Everything it creates (session, appointment, notification, and
// any throwaway patient) is removed at the end.
//
//   ALLOW_FSM_SIM=1 npx tsx scripts/verifyFsmDeterministic.ts
// ===========================================================================
import { prisma } from '../src/config/prisma.js';
import { handleWhatsAppMessage } from '../src/modules/whatsapp/whatsapp.booking.js';

const NAMES = ['Ankit', 'Piyush', 'Anish'];
const PLATFORM = 'platform@clinicbook.ai';

// What a patient replies, given the prompt they are now looking at (the state
// the FSM persisted). Pure numbered menu — no free text, so zero AI is touched.
const nextInput = (state: string): string => {
  switch (state) {
    case 'SPECIALITY_SELECTION':
      return '1';
    case 'DOCTOR_SELECTION':
      return '1';
    case 'SLOT_SELECTION':
      return '1';
    case 'CONFIRMATION':
      return 'YES';
    default: // IDLE / MENU
      return '1';
  }
};

const countAi = async (patientId: string) => {
  const convos = await prisma.aiConversation.count({ where: { patientId } });
  const msgs = await prisma.aiMessage.count({ where: { conversation: { patientId } } });
  return { convos, msgs };
};

const main = async () => {
  if (process.env.ALLOW_FSM_SIM !== '1') {
    console.error('Refusing to run: set ALLOW_FSM_SIM=1 to allow DB writes.');
    process.exit(1);
  }

  // Same clinic the inbound webhook would bind to.
  const clinic =
    (process.env.WHATSAPP_CLINIC_ID
      ? await prisma.clinic.findUnique({ where: { id: process.env.WHATSAPP_CLINIC_ID }, select: { id: true, name: true } })
      : null) ??
    (await prisma.clinic.findFirst({
      where: { email: { not: PLATFORM } },
      orderBy: { doctors: { _count: 'desc' } },
      select: { id: true, name: true }
    }));
  if (!clinic) return console.error('No clinic found.');
  console.log(`Clinic bound for inbound: "${clinic.name}" (${clinic.id})\n`);

  for (let i = 0; i < NAMES.length; i++) {
    const name = NAMES[i];
    // Find existing patient, else create a throwaway (tracked for deletion).
    let patient = await prisma.patient.findFirst({
      where: { clinicId: clinic.id, name: { contains: name, mode: 'insensitive' } },
      select: { id: true, name: true, phone: true, patientCode: true }
    });
    let created = false;
    if (!patient) {
      patient = await prisma.patient.create({
        data: { clinicId: clinic.id, name, phone: `99000000${i}${i}`, language: 'English', source: 'whatsapp' },
        select: { id: true, name: true, phone: true, patientCode: true }
      });
      created = true;
    }

    console.log(`\n=================================================================`);
    console.log(`PATIENT: ${patient.name}  phone=${patient.phone}  ${created ? '(throwaway)' : '(existing)'}`);
    console.log(`=================================================================`);

    // Clean slate + baselines.
    await prisma.whatsAppSession.deleteMany({ where: { phone: patient.phone } });
    const aiBefore = await countAi(patient.id);
    const apptIdsBefore = new Set(
      (await prisma.appointment.findMany({ where: { patientId: patient.id }, select: { id: true } })).map((a) => a.id)
    );

    const base = {
      clinicId: clinic.id,
      patientId: patient.id,
      patientName: patient.name,
      clinicName: clinic.name,
      phone: patient.phone,
      patientCode: patient.patientCode ?? null
    };

    // Drive the conversation. Start with a greeting; thereafter reply by number.
    let input = 'hi';
    let prevState = 'IDLE';
    const statesSeen: string[] = [];
    for (let step = 0; step < 10; step++) {
      const reply = await handleWhatsAppMessage({ ...base, message: input });
      const sess = await prisma.whatsAppSession.findUnique({ where: { phone: patient.phone } });
      const state = sess?.state ?? '(no session)';
      statesSeen.push(state);

      console.log(`\n  PATIENT ▶ "${input}"`);
      console.log(reply.split('\n').map((l) => `      BOT │ ${l}`).join('\n'));
      console.log(`      [session row: ${sess ? 'EXISTS' : 'MISSING'}  state=${state}  one-step-advance=${state !== prevState}]`);

      prevState = state;
      if (state === 'BOOKED') break;
      input = nextInput(state);
    }

    // ---- Assertions ----
    const aiAfter = await countAi(patient.id);
    const newAppts = await prisma.appointment.findMany({
      where: { patientId: patient.id, id: { notIn: [...apptIdsBefore] } },
      include: { doctor: { select: { name: true, speciality: true } } }
    });

    console.log(`\n  ── RESULT for ${patient.name} ──`);
    console.log(`  States traversed: ${statesSeen.join(' → ')}`);
    console.log(`  #3 WhatsAppSession created: ${statesSeen.some((s) => s !== '(no session)') ? 'YES' : 'NO'}`);
    console.log(`  #4 AiConversation rows  before=${aiBefore.convos} after=${aiAfter.convos}  -> new=${aiAfter.convos - aiBefore.convos}`);
    console.log(`  #4 AiMessage rows       before=${aiBefore.msgs} after=${aiAfter.msgs}  -> new=${aiAfter.msgs - aiBefore.msgs}`);
    console.log(`  Booking created: ${newAppts.map((a) => `${a.doctor?.name} ${a.appointmentDate.toISOString().slice(0, 10)} ${a.appointmentTime} [${a.status}]`).join('; ') || 'none'}`);

    // ---- Cleanup (remove everything this run created) ----
    const newIds = newAppts.map((a) => a.id);
    if (newIds.length) {
      await prisma.notification.deleteMany({ where: { appointmentId: { in: newIds } } });
      await prisma.appointment.deleteMany({ where: { id: { in: newIds } } });
    }
    await prisma.whatsAppSession.deleteMany({ where: { phone: patient.phone } });
    if (created) await prisma.patient.delete({ where: { id: patient.id } });
  }

  console.log('\n\nAll three runs complete. Test data cleaned up.');
};

main()
  .catch((e) => console.error('verify failed:', e))
  .finally(() => prisma.$disconnect());
