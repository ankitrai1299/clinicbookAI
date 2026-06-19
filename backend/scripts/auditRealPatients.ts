// ===========================================================================
// READ-ONLY audit of REAL WhatsApp conversations for named patients.
// Pulls actual DB rows only. Does NOT simulate, does NOT write anything.
//   npx tsx scripts/auditRealPatients.ts
// ===========================================================================
import { prisma } from '../src/config/prisma.js';

const NAMES = ['Ankit', 'Piyush', 'Anish'];

const j = (o: unknown) => JSON.stringify(o, null, 2);

async function main() {
  // 1. Find matching patients (case-insensitive contains on name)
  const patients = await prisma.patient.findMany({
    where: { OR: NAMES.map((n) => ({ name: { contains: n, mode: 'insensitive' as const } })) },
    include: { clinic: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' }
  });

  console.log('==================== PATIENTS MATCHED ====================');
  console.log(`count=${patients.length}`);
  for (const p of patients) {
    console.log(
      j({
        id: p.id,
        name: p.name,
        phone: p.phone,
        patientCode: p.patientCode,
        clinicId: p.clinicId,
        clinicName: p.clinic?.name,
        source: p.source,
        language: p.language,
        createdAt: p.createdAt
      })
    );
  }

  for (const p of patients) {
    const digits = p.phone.replace(/\D/g, '');
    const phoneVariants = [...new Set([p.phone, digits, `91${digits}`, digits.replace(/^91/, '')])];
    console.log(`\n[phone keys searched: ${phoneVariants.join(', ')}]`);
    console.log(`\n\n#################### PATIENT: ${p.name} (${p.phone}) ####################`);

    // 2. WhatsApp session (FSM state) — by phone OR patientId
    const sessions = await prisma.whatsAppSession.findMany({
      where: { OR: [...phoneVariants.map((v) => ({ phone: v })), { patientId: p.id }] }
    });
    console.log('---------- WhatsAppSession (FSM) ----------');
    if (!sessions.length) console.log('NONE');
    for (const s of sessions) {
      console.log(
        j({
          phone: s.phone,
          state: s.state,
          patientId: s.patientId,
          clinicId: s.clinicId,
          data: (() => {
            try {
              return JSON.parse(s.data);
            } catch {
              return s.data;
            }
          })(),
          createdAt: s.createdAt,
          updatedAt: s.updatedAt
        })
      );
    }

    // 3. WhatsApp conversation window
    const convo = await prisma.whatsAppConversation.findMany({
      where: { OR: phoneVariants.map((v) => ({ phone: v })) }
    });
    console.log('---------- WhatsAppConversation (window) ----------');
    console.log(convo.length ? j(convo) : 'NONE');

    // 4. FULL message timeline (inbound + outbound), chronological
    const logs = await prisma.whatsAppLog.findMany({
      where: { OR: phoneVariants.map((v) => ({ to: v })) },
      orderBy: { createdAt: 'asc' }
    });
    console.log(`---------- WhatsAppLog TIMELINE (${logs.length} rows) ----------`);
    for (const l of logs) {
      const dir = l.messageType === 'inbound_text' ? 'IN ◀' : 'OUT ▶';
      console.log(
        `[${l.createdAt.toISOString()}] ${dir} type=${l.messageType} status=${l.status}` +
          (l.error ? ` ERROR=${l.error}` : '')
      );
      console.log('   ' + l.body.replace(/\n/g, '\n   '));
    }

    // 5. Appointments
    const appts = await prisma.appointment.findMany({
      where: { patientId: p.id },
      include: { doctor: { select: { name: true, speciality: true } }, reminders: true },
      orderBy: { appointmentDate: 'asc' }
    });
    console.log(`---------- Appointments (${appts.length}) ----------`);
    for (const a of appts) {
      console.log(
        j({
          id: a.id,
          doctor: a.doctor?.name,
          speciality: a.doctor?.speciality,
          date: a.appointmentDate.toISOString().slice(0, 10),
          time: a.appointmentTime,
          status: a.status,
          reminders: a.reminders.map((r) => ({ type: r.type, sent: r.sent }))
        })
      );
    }

    // 6. Notifications referencing this patient's appointments
    const apptIds = appts.map((a) => a.id);
    const notifs = apptIds.length
      ? await prisma.notification.findMany({
          where: { appointmentId: { in: apptIds } },
          orderBy: { createdAt: 'asc' }
        })
      : [];
    console.log(`---------- Notifications (${notifs.length}) ----------`);
    for (const n of notifs) {
      console.log(
        j({ type: n.type, title: n.title, body: n.body, read: n.read, createdAt: n.createdAt, appointmentId: n.appointmentId })
      );
    }
  }

  // 7. Global counts for cross-patient isolation evidence
  console.log('\n\n==================== GLOBAL EVIDENCE ====================');
  const totalSessions = await prisma.whatsAppSession.count();
  const totalLogs = await prisma.whatsAppLog.count();
  const totalAppts = await prisma.appointment.count();
  const totalNotifs = await prisma.notification.count();
  console.log(j({ totalSessions, totalLogs, totalAppts, totalNotifs }));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
