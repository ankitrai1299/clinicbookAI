// READ-ONLY global evidence for the conversation audit.
import { prisma } from '../src/config/prisma.js';
const j = (o: unknown) => JSON.stringify(o, null, 2);

async function main() {
  // Message type distribution
  const byType = await prisma.whatsAppLog.groupBy({
    by: ['messageType'],
    _count: { _all: true }
  });
  console.log('==== WhatsAppLog by messageType ====');
  console.log(j(byType.map((r) => ({ messageType: r.messageType, count: r._count._all }))));

  const inbound = await prisma.whatsAppLog.count({ where: { messageType: 'inbound_text' } });
  console.log(`\nTOTAL inbound_text rows in entire DB: ${inbound}`);

  // All sessions
  const sessions = await prisma.whatsAppSession.findMany({
    orderBy: { updatedAt: 'desc' }
  });
  console.log(`\n==== ALL WhatsAppSession rows (${sessions.length}) ====`);
  for (const s of sessions) {
    console.log(j({ phone: s.phone, state: s.state, patientId: s.patientId, updatedAt: s.updatedAt }));
  }

  // All conversation windows
  const windows = await prisma.whatsAppConversation.findMany();
  console.log(`\n==== ALL WhatsAppConversation rows (${windows.length}) ====`);
  for (const w of windows) console.log(j({ phone: w.phone, lastInboundAt: w.lastInboundAt }));

  // failed/errored outbound
  const failed = await prisma.whatsAppLog.findMany({
    where: { OR: [{ status: { not: 'sent' } }, { error: { not: null } }] },
    orderBy: { createdAt: 'asc' }
  });
  console.log(`\n==== Failed/errored WhatsApp sends (${failed.length}) ====`);
  for (const f of failed) console.log(j({ to: f.to, type: f.messageType, status: f.status, error: f.error, at: f.createdAt }));

  // Reminders overall
  const reminders = await prisma.reminder.findMany({ include: { appointment: { include: { patient: { select: { name: true } }, doctor: { select: { name: true } } } } } });
  console.log(`\n==== ALL Reminders (${reminders.length}) ====`);
  for (const r of reminders) {
    console.log(j({ type: r.type, sent: r.sent, patient: r.appointment.patient?.name, doctor: r.appointment.doctor?.name, date: r.appointment.appointmentDate.toISOString().slice(0,10), time: r.appointment.appointmentTime, status: r.appointment.status }));
  }

  // AiConversation count (should be 0 for whatsapp channel per FSM design)
  const aiConvos = await prisma.aiConversation.count({ where: { channel: 'whatsapp' } });
  console.log(`\nAiConversation rows with channel=whatsapp: ${aiConvos}`);

  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
