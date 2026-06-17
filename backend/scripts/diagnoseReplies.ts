/**
 * READ-ONLY diagnosis of the reply/booking break point for specific patients.
 *
 * For each named patient it prints, straight from the DB (ground truth):
 *   - the patient record(s) that match (and any duplicates)
 *   - whether the webhook ever recorded an inbound (WhatsAppConversation +
 *     inbound_text logs) → "did Meta deliver the message to us?"
 *   - the latest inbound message we logged
 *   - the latest outbound reply we logged, with its status (sent/failed) and the
 *     EXACT Meta error if it failed → "did our reply actually go out?"
 *   - whether an AI conversation / appointment exists → "did the flow run?"
 *
 *   Run:  npx tsx scripts/diagnoseReplies.ts
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { prisma } from '../src/config/prisma.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const CLINIC_ID = process.env.WHATSAPP_CLINIC_ID ?? '';
const nationalKey = (s: string) => {
  const d = (s ?? '').replace(/\D/g, '');
  return d.length > 10 ? d.slice(-10) : d;
};

const NAMES = ['Ankit', 'Piyush', 'Anish'];

const fmt = (d?: Date | null) => (d ? d.toISOString().replace('T', ' ').slice(0, 19) : '—');

const run = async () => {
  console.log(`\nCLINIC_ID = ${CLINIC_ID || '(unset)'}\n`);

  // Show every WhatsAppLog status seen, to understand global health.
  const statusBreakdown = await prisma.whatsAppLog.groupBy({
    by: ['status', 'messageType'],
    _count: { _all: true }
  });
  console.log('=== WhatsAppLog totals (all clinics) ===');
  for (const s of statusBreakdown.sort((a, b) => b._count._all - a._count._all)) {
    console.log(`   ${String(s.status).padEnd(10)} ${String(s.messageType).padEnd(22)} ${s._count._all}`);
  }

  // Surface any FAILED outbound sends with their error — the smoking gun.
  const failures = await prisma.whatsAppLog.findMany({
    where: { status: 'failed' },
    orderBy: { createdAt: 'desc' },
    take: 15
  });
  console.log(`\n=== Most recent FAILED outbound sends (${failures.length}) ===`);
  for (const f of failures) {
    console.log(`   ${fmt(f.createdAt)} to=${f.to} type=${f.messageType}`);
    console.log(`      error: ${f.error ?? '(none recorded)'}`);
  }

  for (const name of NAMES) {
    console.log(`\n\n────────────────────────────────────────────`);
    console.log(`PATIENT SEARCH: "${name}"`);
    console.log(`────────────────────────────────────────────`);

    const patients = await prisma.patient.findMany({
      where: { name: { contains: name, mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' }
    });

    if (patients.length === 0) {
      console.log('   ⚠️  No patient record found by that name.');
    }

    // Collect the national keys for every matching record so we can find logs
    // even when the stored phone format differs from how Meta delivers it.
    const keys = new Set<string>();
    for (const p of patients) {
      const k = nationalKey(p.phone);
      if (k) keys.add(k);
      console.log(
        `   • ${p.name} | id=${p.patientCode ?? p.id} | phone="${p.phone}" (nat=${k}) | ` +
          `clinicId=${p.clinicId}${p.clinicId === CLINIC_ID ? ' ✅bound' : ' ⚠️OTHER clinic'} | ` +
          `source=${p.source} | created=${fmt(p.createdAt)}`
      );
    }

    for (const key of keys) {
      console.log(`\n   ── phone (national ${key}) ──`);

      // Did the webhook ever record an inbound for this number? (session window)
      const convo = await prisma.whatsAppConversation.findFirst({
        where: { phone: { contains: key } },
        orderBy: { lastInboundAt: 'desc' }
      });
      console.log(
        `   Webhook received inbound? ${convo ? `YES — last inbound ${fmt(convo.lastInboundAt)} (phone stored "${convo.phone}")` : 'NO RECORD'}`
      );

      // Latest inbound message we logged for this number.
      const inbound = await prisma.whatsAppLog.findFirst({
        where: { messageType: 'inbound_text', to: { contains: key } },
        orderBy: { createdAt: 'desc' }
      });
      console.log(
        `   Latest INBOUND msg:  ${inbound ? `"${(inbound.body ?? '').slice(0, 60)}" @ ${fmt(inbound.createdAt)}` : '— none logged —'}`
      );

      // Latest outbound reply (auto_reply or any session/template send) + status.
      const outbound = await prisma.whatsAppLog.findFirst({
        where: { to: { contains: key }, messageType: { not: 'inbound_text' } },
        orderBy: { createdAt: 'desc' }
      });
      if (outbound) {
        console.log(
          `   Latest OUTBOUND reply: "${(outbound.body ?? '').slice(0, 60)}" @ ${fmt(outbound.createdAt)}`
        );
        console.log(
          `      type=${outbound.messageType} status=${outbound.status} waMessageId=${outbound.waMessageId ?? '—'}`
        );
        if (outbound.error) console.log(`      ⛔ error: ${outbound.error}`);
      } else {
        console.log('   Latest OUTBOUND reply: — none sent —');
      }

      // Count sent vs failed for this number.
      const sent = await prisma.whatsAppLog.count({ where: { to: { contains: key }, status: 'sent', messageType: { not: 'inbound_text' } } });
      const failed = await prisma.whatsAppLog.count({ where: { to: { contains: key }, status: 'failed' } });
      const delivered = await prisma.whatsAppLog.count({ where: { to: { contains: key }, status: 'delivered' } });
      const read = await prisma.whatsAppLog.count({ where: { to: { contains: key }, status: 'read' } });
      console.log(`   Outbound tally: sent=${sent} delivered=${delivered} read=${read} failed=${failed}`);
    }

    // Did the receptionist flow start? (AI conversation exists for the patient)
    for (const p of patients) {
      const convo = await prisma.aiConversation.findFirst({
        where: { patientId: p.id, channel: 'whatsapp' },
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { messages: true } } }
      });
      const appts = await prisma.appointment.count({ where: { patientId: p.id } });
      console.log(
        `   Receptionist flow for ${p.patientCode ?? p.id}: ${
          convo ? `AI convo exists (${convo._count.messages} msgs)` : 'NO AI conversation'
        } | appointments=${appts}`
      );
    }
  }

  await prisma.$disconnect();
};

run().catch(async (err) => {
  console.error('diagnose crashed:', err?.message ?? err);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
