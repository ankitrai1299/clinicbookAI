// ===========================================================================
// One-off cleanup: remove specific TEST patients + their related test data for
// the current clinic (the clinic bound to the WhatsApp number,
// WHATSAPP_CLINIC_ID). Deterministic, FK-safe order, all inside a transaction.
//
// DELETES (scoped to the clinic):
//   - the named test patients
//   - their appointments (→ reminders cascade) and the notifications tied to them
//   - their WhatsAppSession rows (FSM state)         [by patientId + phone]
//   - their AiConversation/AiMessage rows            [cascade on patient delete]
//   - their Waitlist row                              [cascade on patient delete]
//   - their WhatsAppConversation + WhatsAppLog rows  [by phone, test chatter]
//
// PRESERVES: clinic, users, doctors, doctor schedules/leaves, clinic settings,
// WhatsApp configuration (.env). Nothing here touches any of those tables.
//
//   ALLOW_CLEANUP=1 npx tsx scripts/cleanupTestPatients.ts
// ===========================================================================
import { prisma } from '../src/config/prisma.js';

const TARGET_NAMES = ['ankit', 'piyush', 'anish', 'WhatsApp Patient 0312'];

// Last-10-digits key — matches the FSM/inbound normalization so phone-keyed
// rows (sessions, logs) are caught regardless of +country / spaces / punctuation.
const phoneKey = (phone: string): string => phone.replace(/\D/g, '').slice(-10);

const main = async (): Promise<void> => {
  if (process.env.ALLOW_CLEANUP !== '1') {
    console.error('Refusing to run: set ALLOW_CLEANUP=1 to allow DB deletes.');
    process.exit(1);
  }

  const clinicId = process.env.WHATSAPP_CLINIC_ID;
  if (!clinicId) {
    console.error('WHATSAPP_CLINIC_ID is not set in .env — cannot scope cleanup.');
    process.exit(1);
  }
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { id: true, name: true }
  });
  if (!clinic) {
    console.error(`Clinic ${clinicId} not found.`);
    process.exit(1);
  }
  console.log(`Clinic: "${clinic.name}" (${clinic.id})\n`);

  // ---- Resolve target patients (case-insensitive exact name match) ----------
  const patients = await prisma.patient.findMany({
    where: {
      clinicId: clinic.id,
      OR: TARGET_NAMES.map((name) => ({ name: { equals: name, mode: 'insensitive' as const } }))
    },
    select: { id: true, name: true, phone: true }
  });

  if (patients.length === 0) {
    console.log('No matching test patients found. Nothing to delete.');
  } else {
    console.log('Target patients found:');
    for (const p of patients) console.log(`  - ${p.name}  (phone=${p.phone}, id=${p.id})`);
  }

  const foundNames = new Set(patients.map((p) => p.name.toLowerCase()));
  const missing = TARGET_NAMES.filter((n) => !foundNames.has(n.toLowerCase()));
  if (missing.length) console.log(`\nNot present (skipped): ${missing.join(', ')}`);

  const patientIds = patients.map((p) => p.id);
  // Phone keys for phone-keyed tables; collect both the raw stored phone and the
  // last-10 key so a stored "+91 …" still matches a digits-only session row.
  const rawPhones = patients.map((p) => p.phone);
  const keys = patients.map((p) => phoneKey(p.phone)).filter(Boolean);

  // ---- Inventory of what will be removed (read-only, pre-delete) -------------
  const apptRows = patientIds.length
    ? await prisma.appointment.findMany({ where: { clinicId: clinic.id, patientId: { in: patientIds } }, select: { id: true } })
    : [];
  const apptIds = apptRows.map((a) => a.id);

  const inv = {
    appointments: apptIds.length,
    reminders: apptIds.length
      ? await prisma.reminder.count({ where: { appointmentId: { in: apptIds } } })
      : 0,
    notifications: apptIds.length
      ? await prisma.notification.count({ where: { clinicId: clinic.id, appointmentId: { in: apptIds } } })
      : 0,
    waitlist: patientIds.length ? await prisma.waitlist.count({ where: { patientId: { in: patientIds } } }) : 0,
    aiConversations: patientIds.length ? await prisma.aiConversation.count({ where: { patientId: { in: patientIds } } }) : 0,
    aiMessages: patientIds.length
      ? await prisma.aiMessage.count({ where: { conversation: { patientId: { in: patientIds } } } })
      : 0,
    whatsAppSessions: patientIds.length
      ? await prisma.whatsAppSession.count({
          where: { OR: [{ patientId: { in: patientIds } }, { phone: { in: rawPhones } }] }
        })
      : 0,
    whatsAppConversations: keys.length
      ? await prisma.whatsAppConversation.count({ where: { OR: keys.map((k) => ({ phone: { endsWith: k } })) } })
      : 0,
    whatsAppLogs: keys.length
      ? await prisma.whatsAppLog.count({
          where: { clinicId: clinic.id, OR: keys.map((k) => ({ to: { endsWith: k } })) }
        })
      : 0
  };
  console.log('\nRelated data to remove:');
  for (const [k, v] of Object.entries(inv)) console.log(`  ${k}: ${v}`);

  // ---- Delete (FK-safe order, transactional) --------------------------------
  if (patientIds.length) {
    await prisma.$transaction(async (tx) => {
      // notifications referencing the appointments (no FK → delete explicitly)
      if (apptIds.length) {
        await tx.notification.deleteMany({ where: { clinicId: clinic.id, appointmentId: { in: apptIds } } });
        // appointments (reminders cascade via onDelete: Cascade)
        await tx.appointment.deleteMany({ where: { clinicId: clinic.id, patientId: { in: patientIds } } });
      }
      // FSM sessions (by patientId or stored phone)
      await tx.whatsAppSession.deleteMany({
        where: { OR: [{ patientId: { in: patientIds } }, { phone: { in: rawPhones } }] }
      });
      // 24h-window trackers + send logs for these test phones
      if (keys.length) {
        await tx.whatsAppConversation.deleteMany({ where: { OR: keys.map((k) => ({ phone: { endsWith: k } })) } });
        await tx.whatsAppLog.deleteMany({ where: { clinicId: clinic.id, OR: keys.map((k) => ({ to: { endsWith: k } })) } });
      }
      // patients last — cascades Waitlist + AiConversation + AiMessage
      await tx.patient.deleteMany({ where: { clinicId: clinic.id, id: { in: patientIds } } });
    });
    console.log('\n✅ Deletion complete (transaction committed).');
  }

  // ---- Post-cleanup counts (clinic-scoped) ----------------------------------
  const [pc, ac, sc, nc] = await Promise.all([
    prisma.patient.count({ where: { clinicId: clinic.id } }),
    prisma.appointment.count({ where: { clinicId: clinic.id } }),
    prisma.whatsAppSession.count({ where: { clinicId: clinic.id } }),
    prisma.notification.count({ where: { clinicId: clinic.id } })
  ]);
  console.log('\n──────── Post-cleanup counts (current clinic) ────────');
  console.log(`  Patients:        ${pc}`);
  console.log(`  Appointments:    ${ac}`);
  console.log(`  WhatsAppSessions: ${sc}`);
  console.log(`  Notifications:   ${nc}`);
};

main()
  .catch((e) => {
    console.error('cleanup failed:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
