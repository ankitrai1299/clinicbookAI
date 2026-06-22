/** READ-ONLY status check for one WhatsApp number. No writes, no sends. */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { prisma } = await import('../src/config/prisma.js');

const NATIONAL = process.argv[2] ?? '7903884686';
console.log(`\n=== Checking number containing "${NATIONAL}" ===\n`);

// Patients whose stored phone contains the national digits.
const patients = await prisma.patient.findMany({
  where: { phone: { contains: NATIONAL } },
  include: { clinic: { select: { id: true, name: true } } }
});
console.log(`Patients matched: ${patients.length}`);
for (const p of patients) {
  console.log(
    `  • ${p.name} | phone=${p.phone} | code=${p.patientCode ?? '-'} | source=${p.source} | clinic=${p.clinic?.name} (${p.clinicId})`
  );
  const appts = await prisma.appointment.findMany({
    where: { patientId: p.id },
    include: { doctor: { select: { name: true, speciality: true } } },
    orderBy: [{ appointmentDate: 'desc' }],
    take: 5
  });
  console.log(`    appointments (last ${appts.length}):`);
  for (const a of appts) {
    console.log(
      `      - ${a.doctor?.name} (${a.doctor?.speciality}) ${a.appointmentDate.toISOString().slice(0, 10)} ${a.appointmentTime} [${a.status}]`
    );
  }
}

// FSM session state.
const sessions = await prisma.whatsAppSession.findMany({ where: { phone: { contains: NATIONAL } } });
console.log(`\nWhatsAppSession rows: ${sessions.length}`);
for (const s of sessions) {
  console.log(`  • phone=${s.phone} | state=${s.state} | updatedAt=${s.updatedAt.toISOString()} | data=${s.data}`);
}

// 24h conversation window.
const convo = await prisma.whatsAppConversation.findFirst({ where: { phone: { contains: NATIONAL } } });
if (convo) {
  const ageH = ((Date.now() - convo.lastInboundAt.getTime()) / 3_600_000).toFixed(1);
  console.log(`\nSession window: lastInboundAt=${convo.lastInboundAt.toISOString()} (${ageH}h ago) → ${Number(ageH) < 24 ? 'OPEN' : 'CLOSED'}`);
} else {
  console.log('\nSession window: no WhatsAppConversation row.');
}

// Recent message log (inbound + outbound).
const logs = await prisma.whatsAppLog.findMany({
  where: { to: { contains: NATIONAL } },
  orderBy: { createdAt: 'desc' },
  take: 12
});
console.log(`\nLast ${logs.length} WhatsAppLog entries (newest first):`);
for (const l of logs) {
  const body = l.body.replace(/\s+/g, ' ').slice(0, 90);
  console.log(`  ${l.createdAt.toISOString()} | ${l.messageType} | ${l.status} | ${body}${l.error ? ` | ERR=${l.error.slice(0, 60)}` : ''}`);
}

// Receptionist audit (new table).
const audit = await prisma.whatsAppAudit.findMany({
  where: { phone: { contains: NATIONAL } },
  orderBy: { createdAt: 'desc' },
  take: 10
});
console.log(`\nLast ${audit.length} WhatsAppAudit rows:`);
for (const a of audit) {
  console.log(
    `  ${a.createdAt.toISOString()} | "${a.message.slice(0, 40)}" | intent=${a.intent ?? '-'} conf=${a.confidence ?? '-'} | ${a.fsmStateFrom}→${a.fsmStateTo} | action=${a.action ?? '-'} | ${a.source}`
  );
}

console.log(`\nFlags: WA_AI_RECEPTIONIST=${process.env.WA_AI_RECEPTIONIST ?? '(unset→off)'} | WA_INTERACTIVE=${process.env.WA_INTERACTIVE ?? '(unset→off)'}`);
await prisma.$disconnect();
