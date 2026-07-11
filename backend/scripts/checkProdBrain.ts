// Read-only check against the LIVE (Supabase) DB: has the MCP brain engaged?
// Bypasses env.ts (which override-loads .env.local → localhost) by pointing a
// PrismaClient explicitly at .env's DATABASE_URL (prod). READ ONLY — no writes.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envText = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8');
const m = envText.match(/^DATABASE_URL\s*=\s*"?([^"\n\r]+)"?/m);
if (!m) throw new Error('DATABASE_URL not found in backend/.env');
const url = m[1];
console.log('Prod DB host:', url.replace(/:[^@/]*@/, ':***@').replace(/\?.*$/, ''));

const prisma = new PrismaClient({ datasourceUrl: url });

const mask = (s: string) => (s.length > 4 ? `…${s.slice(-4)}` : s);

// 1) BRAIN proof — ConversationSession (only the brain writes this).
const total = await prisma.conversationSession.count();
console.log('\n[1] ConversationSession (brain) rows:', total);
const cs = await prisma.conversationSession.findMany({
  orderBy: { updatedAt: 'desc' },
  take: 5,
  select: { patientId: true, channel: true, activeSkill: true, updatedAt: true }
});
for (const r of cs) {
  console.log(`    patient=${r.patientId}  channel=${r.channel}  activeSkill=${r.activeSkill ?? '(settled)'}  ${r.updatedAt.toISOString()}`);
}
if (cs.length === 0) console.log('    (none — brain has NOT engaged)');

// 2) Did the inbound even reach the backend + what was sent back?
const logs = await prisma.whatsAppLog.findMany({
  orderBy: { createdAt: 'desc' },
  take: 8,
  select: { to: true, messageType: true, status: true, body: true, createdAt: true }
});
console.log('\n[2] Recent WhatsAppLog (most recent first):');
for (const l of logs) {
  const body = (l.body || '').replace(/\s+/g, ' ').slice(0, 40);
  console.log(`    ${l.createdAt.toISOString()}  to=${mask(l.to)}  type=${l.messageType}  status=${l.status}  "${body}"`);
}
if (logs.length === 0) console.log('    (no WhatsApp logs at all)');

// 2b) Latest appointments — is the WhatsApp booking PENDING (correct) or CONFIRMED?
const appts = await prisma.appointment.findMany({
  orderBy: { appointmentDate: 'desc' },
  take: 6,
  select: { id: true, status: true, appointmentDate: true, appointmentTime: true, patientId: true }
});
console.log('\n[2b] Latest appointments (status check):');
for (const a of appts) {
  console.log(`    status=${a.status}  ${a.appointmentDate.toISOString().slice(0,10)} ${a.appointmentTime}  patient=${a.patientId}`);
}

// 3) Did the FSM handle it? (FSM writes WhatsAppSession)
const ws = await prisma.whatsAppSession.findMany({
  orderBy: { updatedAt: 'desc' },
  take: 5,
  select: { phone: true, state: true, updatedAt: true }
});
console.log('\n[3] Recent WhatsAppSession (FSM) rows:');
for (const r of ws) {
  console.log(`    phone=${mask(r.phone)}  state=${r.state}  ${r.updatedAt.toISOString()}`);
}
if (ws.length === 0) console.log('    (none)');

await prisma.$disconnect();
