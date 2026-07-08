// Register an outbound webhook endpoint for a clinic. The signing secret is
// printed ONCE — give it to the partner; we store only an encrypted copy.
//   npx tsx scripts/registerWebhook.ts <url> [events,comma,separated] [clinicId]
// Default events: every deliverable one.
import '../src/config/env.js';
import { prisma } from '../src/config/prisma.js';
import { DELIVERABLE_EVENTS, listWebhooks, registerWebhook } from '../src/core/webhooks/webhook.service.js';

async function main() {
  const url = process.argv[2];
  if (!url) throw new Error('Usage: npx tsx scripts/registerWebhook.ts <url> [events] [clinicId]');

  const events = process.argv[3] ? process.argv[3].split(',').map((e) => e.trim()) : [...DELIVERABLE_EVENTS];
  let clinicId = process.argv[4];
  if (!clinicId) {
    const clinic = await prisma.clinic.findFirst({ select: { id: true, name: true } });
    if (!clinic) throw new Error('No clinic in DB.');
    clinicId = clinic.id;
    console.log(`Clinic: ${clinic.name} (${clinic.id})`);
  }

  const hook = await registerWebhook(clinicId, url, events);
  console.log(`\nRegistered ${hook.id}\n  url    : ${hook.url}\n  events : ${hook.events.join(', ')}`);
  console.log('\n=== SIGNING SECRET (shown once) ===');
  console.log(hook.secret);
  console.log('===================================\n');
  console.log('Verify each request:  X-ClinicBook-Signature: t=<unix>,v1=<hex>');
  console.log('  v1 == HMAC_SHA256(secret, `${t}.${rawBody}`)   — reject if |now-t| > 300s\n');

  const all = await listWebhooks(clinicId);
  console.log(`Endpoints for this clinic: ${all.length}`);
  for (const w of all) console.log(`  - ${w.url} [${w.events.join(', ')}]${w.enabled ? '' : ' (disabled)'}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('ERR:', e.message); process.exit(1); });
