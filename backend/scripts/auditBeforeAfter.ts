// READ-ONLY snapshot for before/after evidence (Appointment, Reminder, doctors,
// recent WhatsAppLog doctor-name renders, and reminder candidate set).
//   npx tsx scripts/auditBeforeAfter.ts <label>
import { AppointmentStatus } from '@prisma/client';
import { prisma } from '../src/config/prisma.js';
const j = (o: unknown) => JSON.stringify(o, null, 2);
const label = process.argv[2] ?? 'SNAPSHOT';

async function main() {
  console.log(`\n==================== ${label} ====================`);

  // Doctors (source data)
  const docs = await prisma.doctor.findMany({ select: { id: true, name: true, speciality: true }, orderBy: { name: 'asc' } });
  console.log('---- Doctors (raw stored names) ----');
  console.log(j(docs));

  // Appointment table
  const appts = await prisma.appointment.findMany({
    include: { patient: { select: { name: true } }, doctor: { select: { name: true } } },
    orderBy: [{ appointmentDate: 'asc' }, { appointmentTime: 'asc' }]
  });
  console.log(`---- Appointment table (${appts.length}) ----`);
  for (const a of appts) console.log(`${a.patient?.name} | ${a.doctor?.name} | ${a.appointmentDate.toISOString().slice(0,10)} ${a.appointmentTime} | ${a.status} | id=${a.id}`);

  // Reminder table
  const rems = await prisma.reminder.findMany({ include: { appointment: { include: { patient: { select: { name: true } }, doctor: { select: { name: true } } } } } });
  console.log(`---- Reminder table (${rems.length}) ----`);
  for (const r of rems) console.log(`${r.type} sent=${r.sent} | patient=${r.appointment.patient?.name} | doctor=${r.appointment.doctor?.name} | apptStatus=${r.appointment.status} | ${r.appointment.appointmentDate.toISOString().slice(0,10)} ${r.appointment.appointmentTime}`);

  // What WOULD the reminder cron select right now? (read-only — replicate filter)
  const now = new Date();
  const todayMid = new Date(now); todayMid.setUTCHours(0,0,0,0);
  const dayAfterTom = new Date(todayMid); dayAfterTom.setUTCDate(dayAfterTom.getUTCDate()+2);
  const confirmedOnly = await prisma.appointment.findMany({
    where: { status: AppointmentStatus.CONFIRMED, appointmentDate: { gte: todayMid, lt: dayAfterTom } },
    include: { patient: { select: { name: true } }, doctor: { select: { name: true } } }
  });
  console.log(`---- Reminder candidate set with NEW filter (status=CONFIRMED only, in date window): ${confirmedOnly.length} ----`);
  for (const a of confirmedOnly) console.log(`CANDIDATE: ${a.patient?.name} | ${a.doctor?.name} | ${a.status} | ${a.appointmentDate.toISOString().slice(0,10)} ${a.appointmentTime}`);

  // Distinct doctor-name strings as they appear in patient-facing WhatsApp bodies
  const logs = await prisma.whatsAppLog.findMany({ where: { OR: [{ body: { contains: 'Dr.' } }, { body: { contains: 'dr ' } }] }, select: { messageType: true, body: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 30 });
  console.log(`---- Recent WhatsAppLog bodies mentioning a doctor (${logs.length}) ----`);
  const docMentions = new Set<string>();
  for (const l of logs) {
    const matches = l.body.match(/Dr\.?\s+[A-Za-z.][A-Za-z. ]*?(?=\s+(?:at|on|\(|$)|[\n(])/g) ?? [];
    for (const m of matches) docMentions.add(m.trim());
  }
  console.log('Distinct doctor-name renders seen in messages:');
  console.log(j([...docMentions]));

  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
